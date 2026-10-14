"""Fail-closed v2 contract. Time admission precedes interpretation of parity.
No event sorting/deduplication, retry selection, endpoint-only pass, or relaxed epsilon.
"""
import argparse,hashlib,json,math,re
from pathlib import Path
HERE=Path(__file__).resolve().parent
TOLERANCE=1e-7

def diff(a,b,path='$',errors=None):
 errors=[] if errors is None else errors
 if type(a) is not type(b) and not(type(a) in (int,float) and type(b) in (int,float)):
  errors.append({'code':'TYPE','path':path,'native':a,'reference':b});return errors
 if type(a) in (int,float):
  if not math.isfinite(a) or not math.isfinite(b) or abs(a-b)>TOLERANCE*(1+abs(b)):errors.append({'code':'NUMBER','path':path,'native':a,'reference':b})
 elif isinstance(a,dict):
  if set(a)!=set(b):errors.append({'code':'FIELDS','path':path,'native':list(a),'reference':list(b)})
  for k in a:
   if k in b:diff(a[k],b[k],path+'.'+k,errors)
 elif isinstance(a,list):
  if len(a)!=len(b):errors.append({'code':'LENGTH','path':path,'native':len(a),'reference':len(b)})
  for i,(x,y) in enumerate(zip(a,b)):diff(x,y,path+'.'+str(i),errors)
 elif a!=b:errors.append({'code':'VALUE','path':path,'native':a,'reference':b})
 return errors

def validate_case(row,spec):
 errors=[]
 def fail(code,**detail):errors.append({'code':code,'case':row.get('id'),'replicate':row.get('replicate'),**detail})
 scenario=next((c for c in spec['cases'] if c['id']==row.get('id')),None)
 if scenario is None or row.get('status')!='CAPTURED':fail('CAPTURE_INCOMPLETE');return errors
 trace=row.get('trace')
 if not isinstance(trace,dict):fail('TRACE_MISSING');return errors
 for field in ['rawDOM','publicEvents','platformEvents','samples','observations','errors']:
  if not isinstance(trace.get(field),list):fail('CHANNEL_MISSING',field=field)
 if errors:return errors
 steps=['initial']+[x['id'] for x in scenario['actions']]+['quiescent'];rank={s:i for i,s in enumerate(steps)}
 if [s.get('step') for s in trace['samples']]!=steps:fail('SAMPLE_SEQUENCE')
 if row.get('pageErrors') or trace['errors']:fail('OBSERVER_ERRORS')
 if row.get('constructionReturn') is not True:fail('PROGRAM_REJECTED')
 program=spec['program']+('\n'+spec['unrelatedProgram'] if scenario.get('unrelatedUndefined') else '')
 if row.get('program')!=program:fail('PROGRAM_DRIFT')
 labels=spec['labels']+(spec['unrelatedLabels'] if scenario.get('unrelatedUndefined') else [])
 def validate_state(state,step):
  if not isinstance(state,dict) or list(state)!=['names','objects'] or state.get('names')!=labels or not isinstance(state.get('objects'),dict) or list(state['objects'])!=labels:fail('OBJECT_SET',step=step);return
  for n in labels:
   o=state['objects'][n];fields={'exists','type','defined','independent','value'}|({'x','y','z'} if n in spec['coordinateLabels'] else set())
   if not isinstance(o,dict) or set(o)!=fields:fail('OBJECT_FIELDS',step=step,label=n);continue
   if any(type(o[k]) is not bool for k in ['exists','defined','independent']) or not isinstance(o['type'],str):fail('OBJECT_TYPES',step=step,label=n)
   for field in ['value']+(['x','y','z'] if n in spec['coordinateLabels'] else []):
    v=o[field]
    if not isinstance(v,dict) or v.get('type') not in ['number','boolean','string','undefined','object','exception']:fail('TAG_INVALID',step=step,label=n,field=field);continue
    expected={'type'} if v['type']=='undefined' else {'type','message'} if v['type']=='exception' else {'type','value'}
    if set(v)!=expected:fail('TAG_FIELDS',step=step,label=n,field=field)
    if v['type']=='number' and not(type(v.get('value')) in (int,float) and math.isfinite(v['value']) or v.get('value') in ({'$number':'NaN'},{'$number':'Infinity'},{'$number':'-Infinity'})):fail('NUMBER_TAG_INVALID',step=step,label=n,field=field)
 all_seq=[]
 for channel in ['rawDOM','publicEvents','platformEvents']:
  previous=0;previous_step=-1
  for event in trace[channel]:
   seq=event.get('seq');step=event.get('step');rr=rank.get(step,-1)
   if type(seq) is not int or seq<=previous or rr<previous_step or rr<0:fail('EVENT_ORDER',channel=channel)
   previous=seq if type(seq) is int else previous;previous_step=rr;all_seq.append(seq)
   if channel=='publicEvents':
    if set(event)!={'seq','step','perfMs','wallMs','kind','args','state'} or event['kind'] not in ['add','update','remove','clear'] or not isinstance(event['args'],list):fail('PUBLIC_EVENT_FIELDS',step=step)
    validate_state(event.get('state'),step)
 if len(set(all_seq))!=len(all_seq):fail('RAW_SEQUENCE_DUPLICATE')
 for sample in trace['samples']:
  validate_state(sample.get('state'),sample.get('step'))
  cutoff=sample.get('sequenceAfter')
  if type(cutoff) is not int:fail('SAMPLE_CUTOFF',step=sample.get('step'));cutoff=-1
  count=sum(type(e.get('seq')) is int and e['seq']<=cutoff for e in trace['publicEvents'])
  if count!=sample.get('publicEventCount'):fail('CALLBACK_BOUNDARY_COUNT',step=sample.get('step'))
 for o in trace['observations']:
  if o.get('step') not in rank or o.get('kind') not in ['callback','sample'] or not all(type(o.get(k)) in (int,float) and math.isfinite(o[k]) for k in ['startMs','endMs']):fail('OBSERVATION_CLOCK');continue
  elapsed=o['endMs']-o['startMs']
  if elapsed<0 or elapsed>spec['maxPublicObservationMs']:fail('OBSERVATION_BUDGET',step=o['step'],milliseconds=elapsed)
 if len(trace['observations'])!=len(trace['samples'])+len(trace['publicEvents']):fail('OBSERVATION_COUNT')
 pressed=False
 for action in scenario['actions']:
  kind={'down':'pointerdown','up':'pointerup','move':'pointermove'}[action['kind']]
  delivered=[e for e in trace['rawDOM'] if e.get('step')==action['id'] and e.get('type')==kind]
  if action['kind']=='down':pressed=True
  if action['kind']=='up':pressed=False
  if len(delivered)!=1:fail('INPUT_DELIVERY_COUNT',step=action['id'],count=len(delivered));continue
  e=delivered[0]
  if e.get('trusted') is not True or e.get('pointerType')!='mouse' or e.get('buttons')!=int(pressed):fail('UNTRUSTED_OR_WRONG_INPUT',step=action['id'])
  if 'window' in action:
   lower,upper=action['window'];value=e.get('sincePressMs')
   if type(value) not in (int,float) or not lower<=value<=upper:fail('DELIVERY_WINDOW',step=action['id'],expected=[lower,upper],actual=value)
  for field in ['perfMs','wallMs','eventTimeStamp','sincePressMs','sincePressWallMs']:
   if type(e.get(field)) not in (int,float) or not math.isfinite(e[field]):fail('INPUT_CLOCK',step=action['id'],field=field)
  if type(e.get('sincePressMs')) in (int,float) and type(e.get('sincePressWallMs')) in (int,float) and abs(e['sincePressMs']-e['sincePressWallMs'])>3:fail('CLOCK_DISCONTINUITY',step=action['id'])
 # Independent input-intent check: an identical pair of inert traces is not parity.
 # No expected values are used as native/reference execution inputs.
 expected=[1,2];samples={s['step']:s for s in trace['samples']}
 for a in scenario['actions']:
  if a['kind']=='move' and a['window'][0]>100:expected=a['world']
  sample=samples.get(a['id'])
  if sample and 'A' in sample.get('state',{}).get('objects',{}):
   actual=[sample['state']['objects']['A'].get(k) for k in ['x','y']]
   if diff(actual,[{'type':'number','value':v} for v in expected]):fail('INPUT_INTENT_STATE',step=a['id'],actual=actual,expected=expected)
 return errors

def compare(native,reference):
 spec=json.loads((HERE/'protocol.json').read_text());errors=[];protocol_errors=[]
 hashes={n:hashlib.sha256((HERE/n).read_bytes()).hexdigest() for n in ['protocol.json','observer.js','capture.py']}
 for t,engine in [(native,'famtutor'),(reference,'geogebra')]:
  if t.get('engine')!=engine or t.get('status')!='CAPTURED' or t.get('scope')!='SYMMETRIC_PUBLIC_CAPTURE':protocol_errors.append({'code':'CAPTURE_SCOPE','engine':engine})
  if not re.fullmatch('[0-9a-f]{40}',t.get('sourceSha') or '') or not re.fullmatch('[0-9a-f]{40}',t.get('sourceTree') or '') or t.get('trackedDirty') is not False:protocol_errors.append({'code':'SOURCE_IDENTITY','engine':engine})
  for k,n in [('protocolSha256','protocol.json'),('observerSha256','observer.js'),('runnerSha256','capture.py')]:
   if t.get(k)!=hashes[n]:protocol_errors.append({'code':'SOURCE_DRIFT','engine':engine,'field':k})
  if t.get('protocol')!=spec:protocol_errors.append({'code':'PROTOCOL_DRIFT','engine':engine})
  expected=[(r,c['id']) for r in range(spec['replicates']) for c in spec['cases']]
  if [(c.get('replicate'),c.get('id')) for c in t.get('cases',[])]!=expected:protocol_errors.append({'code':'REPLICATES_OR_CASES_MISSING','engine':engine})
  for row in t.get('cases',[]):
   if row.get('audits')!=[]:protocol_errors.append({'code':'ASYMMETRIC_INTERNAL_AUDIT_IN_PRIMARY','engine':engine,'case':row.get('id')})
   scenario=next((x for x in spec['cases'] if x['id']==row.get('id')),None)
   calls=row.get('controllerCalls',[])
   if scenario and [x.get('step') for x in calls]!=[x['id'] for x in scenario['actions']]:protocol_errors.append({'code':'CONTROLLER_CALLS_MISSING','engine':engine,'case':row.get('id')})
   for call in calls:
    times=[call.get(k) for k in ['inputStartNs','inputAckNs','sampleAckNs']]
    if any(type(x) is not int for x in times) or not times[0]<=times[1]<=times[2]:protocol_errors.append({'code':'CONTROLLER_CLOCK','engine':engine,'case':row.get('id'),'step':call.get('step')})
   protocol_errors.extend({'engine':engine,**e} for e in validate_case(row,spec) if e['code']!='INPUT_INTENT_STATE')
   errors.extend({'engine':engine,**e} for e in validate_case(row,spec) if e['code']=='INPUT_INTENT_STATE')
   if engine=='geogebra' and (row.get('runtimeVersion')!=spec['referenceRuntime'] or row.get('selectedCodebase')!=spec['codebase']):protocol_errors.append({'code':'RUNTIME_PIN','case':row['id']})
 for field in ['sourceSha','sourceTree','protocolSha256','observerSha256','runnerSha256']:diff(native.get(field),reference.get(field),field,protocol_errors)
 rows=[]
 for a,b in zip(native.get('cases',[]),reference.get('cases',[])):
  local=[];prefix=f"{a.get('replicate')}:{a.get('id')}";diff(a.get('program'),b.get('program'),prefix+'.program',local)
  na=a.get('trace') or {};rb=b.get('trace') or {}
  public=lambda t:[{k:e[k] for k in ['step','kind','args','state'] if k in e} for e in t.get('publicEvents',[])]
  samples=lambda t:[{k:s[k] for k in ['step','state','publicEventCount'] if k in s} for s in t.get('samples',[])]
  diff(public(na),public(rb),prefix+'.callbacks',local);diff(samples(na),samples(rb),prefix+'.samples',local)
  for x,y in zip([e for e in na.get('rawDOM',[]) if e.get('type') in ['pointerdown','pointermove','pointerup']],[e for e in rb.get('rawDOM',[]) if e.get('type') in ['pointerdown','pointermove','pointerup']]):
   if x['step']!=y['step'] or abs(x['sincePressMs']-y['sincePressMs'])>spec['maxInputPairSkewMs']:protocol_errors.append({'code':'PAIRED_DELIVERY_SKEW','case':prefix,'step':x['step'],'native':x['sincePressMs'],'reference':y['sincePressMs']})
  errors.extend(local);rows.append({'case':prefix,'status':'FAILED' if local else 'SAMPLED_VALUES_EQUAL','samples':len(na.get('samples',[])),'callbacks':{'native':len(na.get('publicEvents',[])),'reference':len(rb.get('publicEvents',[]))},'differences':len(local)})
 return {'schema':'famtutor.pointer.comparison.v2','status':'INPUT_PROTOCOL_FAILED' if protocol_errors else 'FAILED' if errors else 'PASSED_BOUNDED_PROTOCOL_V2','sourceSha':native.get('sourceSha'),'sourceTree':native.get('sourceTree'),'tolerance':TOLERANCE,'protocolErrors':protocol_errors,'differences':errors,'cases':rows,'platformScope':'All raw DOM/client/runtime channels retained. Canvas/SVG metadata and client-listener implementation are not asserted equivalent.','historicalV1':'Retained failed/unstable protocol, not reclassified by v2.','sourceBinaryMapping':'UNVERIFIED'}

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('native',type=Path);p.add_argument('reference',type=Path);p.add_argument('output',type=Path);a=p.parse_args();r=compare(json.loads(a.native.read_text()),json.loads(a.reference.read_text()));a.output.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({k:r[k] for k in ['status','sourceSha','cases']}));raise SystemExit(r['status']!='PASSED_BOUNDED_PROTOCOL_V2')
