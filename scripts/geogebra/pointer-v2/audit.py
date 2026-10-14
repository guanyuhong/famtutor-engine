"""Separate instrumented native replay; never substituted for reference input."""
import argparse,importlib.util,json
from pathlib import Path
HERE=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('contract',HERE/'compare.py');c=importlib.util.module_from_spec(s);s.loader.exec_module(c)
def inspect(report):
 errors=[]
 spec=json.loads((HERE/'protocol.json').read_text())
 expected=[(0,x['id']) for x in spec['cases']]
 if report.get('status')!='CAPTURED' or report.get('protocol')!=spec or [(x.get('replicate'),x.get('id')) for x in report.get('cases',[])]!=expected:errors.append({'code':'AUDIT_CASES_OR_PROTOCOL'})
 if report.get('scope')!='NATIVE_INSTRUMENTED_AUDIT' or report.get('engine')!='famtutor':errors.append({'code':'AUDIT_SCOPE'})
 for row in report.get('cases',[]):
  scenario=next((x for x in spec['cases'] if x['id']==row.get('id')),None)
  if scenario is None:errors.append({'code':'AUDIT_CASE_UNKNOWN'});continue
  errors.extend(c.validate_case(row,spec))
  if len(row.get('audits',[]))!=len(next(x['actions'] for x in report['protocol']['cases'] if x['id']==row['id']))+1:errors.append({'code':'AUDIT_COUNT','case':row['id']})
  samples={x['step']:x for x in (row.get('trace') or {}).get('samples',[])}
  for a in row.get('audits',[]):
   root=row['id']+'.'+a['step'];state=a['state'];public=samples[a['step']]['state']['objects']
   if report.get('nativeWarningOnly') is True and not any(x.get('id')=='pointer-v2-warning' and x.get('severity')=='warning' for x in state['document'].get('assertions',[])):errors.append({'code':'WARNING_ASSERTION_MISSING','path':root})
   c.diff(state['document'],state['mountedDocument'],root+'.canonical',errors)
   if set(state['entities'])!=set(public):errors.append({'code':'AUDIT_ENTITY_SET','path':root})
   for label,value in state['entities'].items():
    if label not in public:continue
    p=public[label];e=value['evaluated'];m=value['mounted']
    c.diff(p['defined'],e['defined'],root+'.'+label+'.defined',errors);c.diff(e,m,root+'.'+label+'.evaluator',errors)
    if not e['defined']:
     if e.get('value') is not None or value.get('renderer') is not None or value.get('native') is not None:errors.append({'code':'UNDEFINED_GEOMETRY_REVIVED','path':root+'.'+label})
    else:
     v=e['value'];c.diff(v,value.get('renderer'),root+'.'+label+'.renderValue',errors)
     if isinstance(v,dict) and v.get('kind')=='point2':
      for k in ['x','y']:
       c.diff({'type':'number','value':v[k]},p[k],root+'.'+label+'.api.'+k,errors)
       c.diff(v[k],(value.get('native') or {}).get(k),root+'.'+label+'.shape.'+k,errors)
 return {'schema':'famtutor.pointer.audit.v2','sourceSha':report.get('sourceSha'),'sourceTree':report.get('sourceTree'),'status':'FAILED' if errors else 'PASSED_NATIVE_AUDIT_ONLY','cases':len(report.get('cases',[])),'nativeWarningOnly':report.get('nativeWarningOnly',False),'errors':errors,'scope':'Instrumented native canonical/evaluator/renderer replay, separate from symmetric primary reference parity.'}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('capture',type=Path);p.add_argument('output',type=Path);a=p.parse_args();r=inspect(json.loads(a.capture.read_text()));a.output.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({k:r[k] for k in ['status','cases']}));raise SystemExit(bool(r['errors']))
