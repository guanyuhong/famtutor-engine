"""Version-pinned inventory, not a count-based compatibility claim.
Downloads official documentation and selected declaration sources read-only.
Unclassified overloads and implementation mappings are explicitly incomplete.
"""
import argparse, csv, hashlib, io, json, pathlib, re, subprocess, sys, tarfile, urllib.request
PINS={'manual':('geogebra/manual','e318ba503db08005e4713e6955d6b9ba5769a36c'),
      'integration':('geogebra/integration','298e983cad5e2f87cab7a330e303487d297960c1'),
      'source':('geogebra/geogebra','325faee17884c7ced41d360d0f08ae919a38a955')}
ROOT=pathlib.Path(__file__).resolve().parents[2]

def download(url,limit=64*1024*1024):
 req=urllib.request.Request(url,headers={'User-Agent':'FamTutor-compatibility-inventory/1','Accept':'application/vnd.github+json'})
 with urllib.request.urlopen(req,timeout=90) as response:
  data=response.read(limit+1)
 if len(data)>limit:raise ValueError('Source exceeds bounded download: '+url)
 return data

def provenance(kind,path,raw,line=None):
 repo,sha=PINS[kind]
 out={'repository':repo,'commit':sha,'path':path,'sha256':hashlib.sha256(raw).hexdigest(),'url':f'https://github.com/{repo}/blob/{sha}/{path}'}
 if line is not None:out['line']=line
 return out

def inventory_row(layer,name,signature,source):
 canonical=re.sub(r'\s+',' ',signature).strip()
 key=hashlib.sha256((layer+'\0'+name+'\0'+canonical).encode()).hexdigest()[:20]
 return {'id':layer+':'+key,'layer':layer,'name':name,'signature':canonical,'sources':[source],
         'implementation':{'status':'UNMAPPED','locations':[]},
         'nativeRegression':{'status':'NOT_RUN','evidence':[]},
         'realDifferential':{'status':'NOT_RUN','evidence':[]},
         'interaction':{'status':'NOT_RUN','evidence':[]},
         'gaps':['No overload-level implementation/evidence mapping established.']}

def command_signatures(text):
 """AsciiDoc definition-list signatures, including wrapped descriptions."""
 lines=text.splitlines();out=[];pending='';start=0
 for number,line in enumerate(lines,1):
  if not pending and re.match(r'^[A-Za-z][A-Za-z0-9_]*\s*\(',line):pending=line;start=number
  elif pending:pending+=' '+line.strip()
  if pending and '::' in pending:
   signature=pending.split('::',1)[0].strip()
   if ')' in signature:out.append((signature.split('(',1)[0].strip(),signature,start))
   pending=''
  elif pending and (not line.strip() or number-start>8):pending=''
 return out

API_SIGNATURE=re.compile(r'(?:(?:[A-Za-z_$][\w$]*(?:\[\])?(?:<[^\n|()]+>)?)\s+)?([A-Za-z_$][\w$]*)\s*\(([^()]*)\)')

def api_signatures(text):
 # API tables have three columns. Do not scan descriptions for apparent method calls.
 lines=text.splitlines();out=[];section='';active=False;buffer=[];base=0
 for number,line in enumerate(lines,1):
  if not active and line.startswith('=='):section=line.lstrip('= ').strip()
  if line.strip()=='|===':
   if not active:active=True;buffer=[];base=number+1;continue
   active=False;body='\n'.join(buffer)
   positions=list(re.finditer(r'(?<!\\)\|',body))
   cells=[body[m.end():positions[i+1].start() if i+1<len(positions) else len(body)] for i,m in enumerate(positions)]
   if not cells or 'Method Signature' not in cells[0]:continue
   if len(cells)%3:raise ValueError('Malformed API table cell count at line '+str(base))
   for i in range(3,len(cells),3):
    raw=cells[i].strip();signature=re.sub(r'\s+',' ',raw);since=cells[i+1].strip()
    matches=list(API_SIGNATURE.finditer(signature))
    if not matches:raise ValueError('Unparsed API signature: '+repr(raw))
    for match in matches:
     line_no=base+body[:positions[i].start()].count('\n')
     out.append((match.group(1),match.group(0),line_no,since,section))
   continue
  if active:buffer.append(line)
 if active:raise ValueError('Unterminated API table')
 return out

def apply_coverage(entries, coverage, evidence_dir=None):
 # This hand-reviewed map selects exact signatures, never whole command names.
 indexed={r['id']:r for r in entries}
 evidence={}
 if evidence_dir is not None:
  folder=pathlib.Path(evidence_dir)
  head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
  if (folder/'commit.txt').read_text().strip()!=head:raise ValueError('Evidence belongs to another source SHA')
  for kind,filename in [('realDifferential','fresh-comparison.json'),('interaction','review-browser.log')]:
   raw=(folder/filename).read_bytes();report=json.loads(raw)
   if report.get('failed')!=0 or report.get('passed',0)<=0:raise ValueError('Required evidence did not pass: '+filename)
   records=report.get('cases') if kind=='realDifferential' else report.get('checks')
   if not isinstance(records,list) or not records:raise ValueError('Evidence has no observations')
   evidence[kind]={'report':report,'records':records,'sourceSha':head,'sha256':hashlib.sha256(raw).hexdigest(),'path':filename}
 for mapping in coverage.get('entries',[]):
  row=indexed.get(mapping['id'])
  if row is None or row['signature']!=mapping['signature']:raise ValueError('Coverage signature drift: '+mapping['id'])
  row['implementation']=mapping['implementation']
  row['gaps']=mapping['gaps']
  row['nativeRegression']={'status':'NOT_RUN','testFiles':mapping['testFiles'],'evidence':[]}
  for kind in ['realDifferential','interaction']:
   required=mapping.get(kind,[])
   if not required:continue
   row[kind]['requiredChecks']=required
   item=evidence.get(kind)
   if item is None:continue
   found={r.get('id',r.get('name')):r for r in item['records']}
   if any(found.get(name,{}).get('status')!='PASSED' for name in required):raise ValueError('Missing required '+kind+' check for '+row['id'])
   row[kind]={'status':'PASSED_SAMPLED_SCOPE','scope':mapping['scope'],'evidence':[{k:v for k,v in item.items() if k not in ['report','records']}],'checks':required}
 return entries

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--output',default='artifacts/compatibility-inventory');ap.add_argument('--evidence-directory');args=ap.parse_args()
 out=pathlib.Path(args.output);out.mkdir(parents=True,exist_ok=True)
 rows=[];files=[];gaps=[];command_pages=0;category_pages=0;source_names=set()
 for kind in ['manual','integration']:
  repo,sha=PINS[kind];url=f'https://codeload.github.com/{repo}/tar.gz/{sha}';archive=download(url)
  files.append({'kind':'archive','url':url,'sha256':hashlib.sha256(archive).hexdigest()})
  with tarfile.open(fileobj=io.BytesIO(archive),mode='r:gz') as tar:
   for member in tar:
    if not member.isfile():continue
    path=member.name.split('/',1)[1] if '/' in member.name else ''
    wanted=(kind=='manual' and path.startswith('en/modules/ROOT/pages/commands/') and path.endswith('.adoc')) or (kind=='integration' and path=='reference/modules/ROOT/pages/GeoGebra_Apps_API.adoc')
    if not wanted:continue
    if member.size>2*1024*1024:raise ValueError('Oversized source page')
    raw=tar.extractfile(member).read();text=raw.decode('utf-8');files.append(provenance(kind,path,raw))
    if kind=='manual':
     if pathlib.PurePosixPath(path).stem.endswith('_Commands'):
      category_pages+=1;continue
     command_pages+=1;signatures=command_signatures(text)
     if not signatures:gaps.append({'code':'COMMAND_PAGE_NO_PARSED_SIGNATURE','source':provenance(kind,path,raw)})
     for name,sig,line in signatures:rows.append(inventory_row('command-overload',name,sig,provenance(kind,path,raw,line)))
    else:
     for name,sig,line,since,section in api_signatures(text):
      row=inventory_row('apps-api',name,sig,provenance(kind,path,raw,line));row.update(sinceRaw=since,documentationSection=section);rows.append(row)
 repo,sha=PINS['source'];tree=json.loads(download(f'https://api.github.com/repos/{repo}/git/trees/{sha}?recursive=1',16*1024*1024))
 if tree.get('truncated'):raise ValueError('Official source tree truncated; inventory refused')
 source_tree=[x for x in tree['tree'] if x['type']=='blob'];declarations=[];processors=[]
 for item in source_tree:
  path=item['path'];name=path.rsplit('/',1)[-1]
  if path.endswith('/Commands.java') or name in ['GgbAPI.java','GgbAPIW.java','GgbAPI3D.java']:
   raw=download(f'https://raw.githubusercontent.com/{repo}/{sha}/{path}',2*1024*1024);text=raw.decode();files.append(provenance('source',path,raw))
   if name=='Commands.java':
    for match in re.finditer(r'^\s*([A-Za-z][A-Za-z0-9_]*)\s*\(\s*(?:TABLE_[A-Z_]+|-?\d+)\s*\)\s*[,;]',text,re.M):
     command=match.group(1);source_names.add(command)
     declarations.append({'name':command,'source':provenance('source',path,raw,text[:match.start()].count('\n')+1)})
   else:
    clean=re.sub(r'/\*.*?\*/',lambda m:'\n'*m.group().count('\n'),text,flags=re.S)
    for match in re.finditer(r'\bpublic\s+(?:(?:static|final|synchronized|abstract)\s+)*(\w+(?:<[^{};]+?>)?(?:\[\])?)\s+(\w+)\s*\(([^(){};]*)\)\s*(?:throws[^{};]+)?[{;]',clean,re.S):
     sig=re.sub(r'\s+',' ',f'{match[1]} {match[2]}({match[3]})')
     row=inventory_row('source-api-declaration',match[2],sig,provenance('source',path,raw,clean[:match.start()].count('\n')+1));row['exportStatus']='UNVERIFIED';rows.append(row)
  if name.startswith('Cmd') and name.endswith('.java'):
   processors.append({'name':name[:-5],'path':path,'blobSha':item['sha'],'sourceCommit':sha})
 if not source_names:raise ValueError('No official Commands enum extracted')
 documented={r['name'] for r in rows if r['layer']=='command-overload'}
 for declaration in declarations:
  if declaration['name'] not in documented:
   row=inventory_row('source-command-unclassified',declaration['name'],'UNCLASSIFIED_OVERLOADS',declaration['source'])
   row['gaps']=['Source identifier has no exact-name English signature match; aliases/overloads must be classified.'];rows.append(row)
 # Link candidates only. Never convert matching names to implementation/compatibility claims.
 byname={}
 for declaration in declarations:byname.setdefault(declaration['name'],[]).append(declaration['source'])
 unique={}
 for row in rows:
  if row['layer']=='command-overload':row['sourceDeclarationCandidates']=byname.get(row['name'],[])
  if row['id'] in unique:unique[row['id']]['sources'].extend(row['sources'])
  else:unique[row['id']]=row
 rows=sorted(unique.values(),key=lambda r:(r['layer'],r['name'],r['signature']))
 coverage_path=ROOT/'docs/geogebra-runtime/coverage-overrides.v1.json'
 coverage=json.loads(coverage_path.read_text()) if coverage_path.exists() else {'entries':[]}
 rows=apply_coverage(rows,coverage,args.evidence_directory)
 manifest={'schema':'famtutor.geogebra.compatibility-matrix.v1','pins':{k:{'repository':v[0],'commit':v[1]} for k,v in PINS.items()},
  'runtime':{'requiredVersion':'5.4.920.0','sourceBinaryMapping':'UNVERIFIED'},
  'inventoryStatus':'DOCUMENTED_SIGNATURES_EXTRACTED_SOURCE_OVERLOAD_CLASSIFICATION_INCOMPLETE',
  'coverageMapping':{'path':str(coverage_path.relative_to(ROOT)),'sha256':hashlib.sha256(coverage_path.read_bytes()).hexdigest() if coverage_path.exists() else None},
  'completeCompatibility':False,'counts':{'commandPages':command_pages,'categoryPages':category_pages,'sourceCommandIdentifiers':len(source_names),'rows':len(rows)},
  'gaps':gaps+[{'code':'SOURCE_DISPATCH_OVERLOAD_CLASSIFICATION_PENDING'},{'code':'API_EXPORT_PLATFORM_MAPPING_PENDING'},{'code':'SEMANTIC_OVERLOAD_AND_VARIADIC_EXPANSION_PENDING'}],
  'sourceFiles':files,'sourceCommandDeclarations':declarations,'commandProcessorCandidates':processors,'entries':rows}
 (out/'matrix.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
 with (out/'matrix.csv').open('w',newline='') as f:
  writer=csv.writer(f);writer.writerow(['id','layer','name','signature','implementation','nativeRegression','realDifferential','interaction','source'])
  for r in rows:writer.writerow([r['id'],r['layer'],r['name'],r['signature'],r['implementation']['status'],r['nativeRegression']['status'],r['realDifferential']['status'],r['interaction']['status'],r['sources'][0]['url']])
 (out/'SHA256SUMS').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n' for p in sorted(out.iterdir()) if p.name!='SHA256SUMS'))
 print(json.dumps({'counts':manifest['counts'],'inventoryStatus':manifest['inventoryStatus'],'gaps':manifest['gaps']}))
 return 0
if __name__=='__main__':sys.exit(main())
