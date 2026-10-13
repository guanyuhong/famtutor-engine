"""Hash-guarded source-byte transfer; no branch writes and no acceptance claim."""
import hashlib,json,os,pathlib,subprocess
repo='guanyuhong/famtutor-engine'
assert os.environ.get('GITHUB_REPOSITORY')==repo
assert os.environ.get('GITHUB_REF')=='refs/heads/codex/geogebra-pr10-v04-20261013'
def blob(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
fallback='''    // Opt-in compatibility policy: Radius reads retained conic axes, not a
    // cached geometric output. All other undefined dependencies remain strict.
    const conicInput = node.inputs?.[0];
    const retained = node.command === "measurement.circle_radius" && node.params?.undefinedPolicy === "conic-axis-state" && conicInput && "ref" in conicInput
      ? retainedConicRadius(graph.nodeById.get(graph.producerByEntity.get(conicInput.ref)!)) : undefined;
    if (undefinedDependency && retained !== undefined && node.outputs.length === 1) {
      const outputId = node.outputs[0]!, entity = entityById.get(outputId);
      if (entity?.type === "scalar") {
        values.set(outputId, retained);
        runtimeEntities.set(outputId, {id:outputId, entity, nodeId:node.id, command:node.command,
          dependencies:graph.entityDependenciesByNode.get(nodeId)??[], defined:true, value:retained});
        continue;
      }
    }
'''
updates=[
 ('packages/math/src/kernel/geometry.ts','cf3ba049d47be053b9ed9bd48a64b27b62a826e7','5efabbad14d6faf193fa21837408680a0f466c79',[
  ('    if (transform.transformKind === "dilate" && transform.factor !== undefined) {\n      return circle(center, Math.abs(value.radius * transform.factor), value.radius === 0);','    if (transform.transformKind === "dilate" && transform.factor !== undefined) {\n      if (transform.factor === 0) throw new MathEngineError("DEGENERATE_TRANSFORM", "Zero conic dilation has no finite transformed conic.");\n      return circle(center, Math.abs(value.radius * transform.factor), value.radius === 0);')]),
 ('packages/math/src/kernel/evaluate.ts','919f3a8326d4cea7748b9898b341e03e3a618092','5b57446f5e3705d019f4291cb3fe75ffb3237499',[
  ('import { pointAtPathParameter } from "./path-parameter.js";','import { pointAtPathParameter } from "./path-parameter.js";\nimport { retainedConicRadius } from "./conic-state.js";'),
  ('    if (undefinedDependency) {\n',fallback+'    if (undefinedDependency) {\n')]),
 ('packages/math/src/geogebra/import.ts','75b6d00598ded49374c228cf3025909339c6d1ed','2869c27fc2219368247fcf6b800eb7123fe4a5f8',[
  ('this.emit(id,"scalar","measurement.circle_radius",args);return;','this.emit(id,"scalar","measurement.circle_radius",args,{undefinedPolicy:"conic-axis-state"});return;'),
  ('            this.emit(id,type,type==="point2"?"point.invert_in_circle":"circle.invert_in_circle",args);return;','            const declared=this.records.get(c.outputs[0]!)?.element?.attributes.type;\n            if(type==="circle2"&&declared&&declared!=="conic") ggbFail("INVERSION_OUTPUT_TYPE_UNSUPPORTED",`Inversion produced ${declared}, not a conic. No circle or saved coordinates are substituted.`);\n            this.emit(id,type,type==="point2"?"point.invert_in_circle":"circle.invert_in_circle",args);return;')]),
 ('packages/math/src/browser-entry.ts','c1adf93c2054e0be974e46df2cfef3944fff80a3','cbbe17351af1c66bd0bcadb4d811238ef9c04b6a',None),
 ('packages/math/src/index.ts','a53f0a27e9f954244d4ed21755c9b5c7d1ff1c16','92427ff4405947d571c5fcd6ccc0bd9bbececef4',None)
]
reports=[]
for name,before,after,replacements in updates:
 raw=pathlib.Path(name).read_bytes();actual=blob(raw)
 assert actual in (before,after),(name,actual)
 text=raw.decode()
 if actual==before:
  if replacements is None:text+='\nexport * from "./geogebra/conic-state.js";\n'
  else:
   for old,new in replacements:
    assert text.count(old)==1,(name,old)
    text=text.replace(old,new)
 assert blob(text.encode())==after,(name,blob(text.encode()))
 result=json.loads(subprocess.check_output(['gh','api','--method','POST',f'repos/{repo}/git/blobs','--input','-'],input=json.dumps({'content':text,'encoding':'utf-8'}).encode()))
 assert result['sha']==after
 reports.append({'path':name,'sourceBlob':actual,'testedResultBlob':after})
out=pathlib.Path('artifacts/reviewed-source');out.mkdir(parents=True,exist_ok=True)
report={'changes':reports,'refsWritten':False,'sourceWorkingFilesChanged':False,'acceptance':'NOT_A_FINAL_SHA_TEST_RESULT'}
(out/'ingested-blob.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
