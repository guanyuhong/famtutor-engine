"""Copy verified original-program evidence into a Git blob, without changing refs.
This is deterministic data transport. It cannot generate expected engine values.
"""
import base64,gzip,hashlib,io,json,os,pathlib,subprocess,zipfile
REPO='guanyuhong/famtutor-engine'
BRANCH='refs/heads/codex/geogebra-pr10-v04-20261013'
ARTIFACT=11812202994
ZIP_SHA='9c659f1779bf44e7de475f6422af35dd303a3bd66e2e208e6d4e29326bf94161'
RAW_SHA='c4fdf3b110dff20e6411ccff26697b32a72c528d4d8713db91f7c4fd72802d76'
BLOB_SHA='14949ae37c7608c06055430f248e4ff858a5fd50'
assert os.environ.get('GITHUB_REPOSITORY')==REPO
assert os.environ.get('GITHUB_REF')==BRANCH
archive=subprocess.check_output(['gh','api',f'repos/{REPO}/actions/artifacts/{ARTIFACT}/zip'])
assert hashlib.sha256(archive).hexdigest()==ZIP_SHA
with zipfile.ZipFile(io.BytesIO(archive)) as z:
 matches=[n for n in z.namelist() if n.endswith('capture.json')]
 assert len(matches)==1
 raw=z.read(matches[0])
assert hashlib.sha256(raw).hexdigest()==RAW_SHA
capture=json.loads(raw)
assert capture['status']=='CAPTURED' and len(capture['cases'])==12
assert capture['captureWorkflowRun']=='38397071472'
assert capture['runtimeVersion']=='5.4.920.0'
compressed=bytearray(gzip.compress(raw,compresslevel=9,mtime=0));compressed[9]=255
encoded=base64.b64encode(compressed).decode()
text='// Exact real GeoGebra capture from Actions run 38397071472; only original programs.\n'
text+='import {gunzipSync} from "node:zlib";\nimport {createHash} from "node:crypto";\n'
text+='const raw=gunzipSync(Buffer.from('+json.dumps(encoded)+',"base64"));\n'
text+='if(createHash("sha256").update(raw).digest("hex")!=='+json.dumps(RAW_SHA)+')throw Error("Reference fixture corruption");\n'
text+='export default JSON.parse(raw.toString("utf8"));\n'
content=text.encode();expected=hashlib.sha1(b'blob '+str(len(content)).encode()+b'\0'+content).hexdigest()
assert expected==BLOB_SHA,(expected,BLOB_SHA)
# Create only an unreferenced content-addressed blob. Commit/ref decisions stay outside this job.
payload=json.dumps({'content':text,'encoding':'utf-8'}).encode()
result=json.loads(subprocess.check_output(['gh','api','--method','POST',f'repos/{REPO}/git/blobs','--input','-'],input=payload))
assert result['sha']==BLOB_SHA
out=pathlib.Path('artifacts/reference-ingest');out.mkdir(parents=True,exist_ok=True)
report={'repository':REPO,'artifactId':ARTIFACT,'captureWorkflowRun':capture['captureWorkflowRun'],'rawSha256':RAW_SHA,'blobSha':BLOB_SHA,'commitOrRefWritten':False}
(out/'ingested-blob.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
