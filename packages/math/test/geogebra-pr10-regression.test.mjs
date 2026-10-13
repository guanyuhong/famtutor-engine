import test from 'node:test';
import assert from 'node:assert/strict';
import {importGeoGebraXml,evaluateMathDocument,renderDirectSvg,validateMathDocument} from '../dist/index.js';
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
const point=(label,x,y)=>`<element type="point" label="${label}"><coords x="${x}" y="${y}" z="1"/><show object="true"/></element>`;
const expression=(label,exp,type,extra='')=>`<expression label="${label}" exp="${esc(exp)}" type="${type}"/><element type="${type}" label="${label}">${extra}<show object="true"/></element>`;
const command=(name,args,out)=>`<command name="${name}"><input ${args.map((v,i)=>`a${i}="${esc(v)}"`).join(' ')}/><output a0="${out}"/></command>`;
const xml=body=>`<geogebra format="5.0"><construction>${body}</construction></geogebra>`;
const vec=expression('v','(1,2)','vector','<coords x="99" y="88" z="0"/>');
const ready=body=>{const r=importGeoGebraXml(xml(body));assert.equal(r.status,'ready',JSON.stringify(r.diagnostics));assert.equal(validateMathDocument(r.document).status,'valid');return r;};
const entity=(r,label)=>evaluateMathDocument(r.document).entities.get(r.labels[label]);
const near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=1e-8*(1+Math.abs(b)),`${a} != ${b}`);
const setPoint=(r,label,coords)=>{r.document.construction.find(n=>n.outputs.includes(r.labels[label])).params.coords=coords;r.document.revision++;};

test('PR10 vector tuple retains vector2, not a draggable point',()=>{const r=ready(vec);assert.equal(r.document.entities.find(e=>e.id===r.labels.v).type,'vector2');assert.equal(entity(r,'v').value.kind,'vector2');near(entity(r,'v').value.x,1);near(entity(r,'v').value.y,2);assert.ok(!r.document.interactions.some(i=>i.target===r.labels.v&&i.permissions.includes('drag')));assert.ok(renderDirectSvg(r.document).report.renderedEntities.includes(r.labels.v));});
test('PR10 Translate consumes the tuple vector and follows parent changes',()=>{const r=ready(point('A',3,4)+vec+command('Translate',['A','v'],'B'));near(entity(r,'B').value.x,4);near(entity(r,'B').value.y,6);setPoint(r,'A',[-2,8]);near(entity(r,'B').value.x,-1);near(entity(r,'B').value.y,10);});
test('PR10 free line equation is reconstructed without cached coefficient substitution',()=>{const r=ready(expression('l','x+y=1','line','<coords x="8" y="9" z="10"/>'));const l=entity(r,'l').value;assert.equal(r.document.entities.find(e=>e.id===r.labels.l).type,'line2');near(l.a+l.c,0);near(l.b+l.c,0);assert.ok(Math.abs(l.c)>0);});
for(const name of ['CircleArc','CircleSector'])test(`PR10 ${name} permits an off-circle direction point and recomputes`,()=>{const r=ready(point('O',0,0)+point('A',2,0)+point('B',0,7)+command(name,['O','A','B'],'c'));let e=entity(r,'c');assert.equal(e.defined,true,JSON.stringify(e));let arc=e.value.arc??e.value;near(arc.radius,2);near(arc.startAngle,0);near(arc.endAngle,Math.PI/2);setPoint(r,'B',[0,14]);e=entity(r,'c');assert.equal(e.defined,true);arc=e.value.arc??e.value;near(arc.radius,2);near(arc.endAngle,Math.PI/2);setPoint(r,'B',[0,-3]);arc=entity(r,'c').value.arc??entity(r,'c').value;near(Math.sin(arc.endAngle),-1);});


test('vector dependencies survive serialization and a scalar update',()=>{let r=ready(expression('a','2','numeric')+expression('v','(a,-a^2)','vector')+point('P',1,1)+command('Translate',['P','v'],'Q'));near(entity(r,'Q').value.y,-3);r.document=JSON.parse(JSON.stringify(r.document));r.document.construction.find(n=>n.outputs.includes(r.labels.a)).params.value=3;near(entity(r,'v').value.x,3);near(entity(r,'v').value.y,-9);near(entity(r,'Q').value.y,-8);});
test('expression-only typed vector is not inferred as a point',()=>{const r=ready('<expression type="vector" label="v" exp="(1,2)"/>');assert.equal(entity(r,'v').entity.type,'vector2');});
test('unsupported typed tuples cannot masquerade as points',()=>{assert.equal(importGeoGebraXml(xml(expression('a','(1,2)','list'))).status,'rejected');});
test('three-component vectors are explicitly rejected by the 2D compiler',()=>{assert.equal(importGeoGebraXml(xml(expression('v','(1,2,3)','vector'))).status,'rejected');});
for(const [equation,on] of [['x=3',[3,-2]],['y=-4',[10,-4]],['2*(x+y)=2',[0,1]],['x/2+y/3=1',[2,0]],['sin(pi/2)*x+y=2',[1,1]],['x+y=x+2*y-1',[12,1]]])test(`independent affine line ${equation}`,()=>{const r=ready(expression('l',equation,'line'));const l=entity(r,'l').value;near(l.a*on[0]+l.b*on[1]+l.c,0);});
for(const equation of ['x*y=1','x^2+y=1','sin(x)=y','x/y=1','x/0+y=1','x-x=1'])test(`no cached-line fallback for ${equation}`,()=>{assert.equal(importGeoGebraXml(xml(expression('l',equation,'line','<coords x="1" y="1" z="-1"/>'))).status,'rejected');});
test('dependent equations remain explicit gaps, never frozen snapshots',()=>{const r=importGeoGebraXml(xml(expression('a','2','numeric')+expression('l','a*x+y=1','line','<coords x="2" y="1" z="-1"/>')));assert.equal(r.status,'rejected');assert.ok(r.diagnostics.some(d=>d.code==='LINE_EQUATION_DEPENDENCY_UNSUPPORTED'));});
for(const name of ['CircularArc','CircularSector'])test(`${name} public name preserves dependency and radius`,()=>{const r=ready(point('O',1,1)+point('A',3,1)+point('B',1,8)+command(name,['O','A','B'],'c'));setPoint(r,'A',[5,1]);let arc=entity(r,'c').value.arc??entity(r,'c').value;near(arc.radius,4);near(arc.end.x,1);near(arc.end.y,5);r.document=JSON.parse(JSON.stringify(r.document));setPoint(r,'A',[1,1]);assert.equal(entity(r,'c').defined,false);setPoint(r,'A',[3,1]);assert.equal(entity(r,'c').defined,true);arc=entity(r,'c').value.arc??entity(r,'c').value;near(arc.radius,2);});
test('Direct SVG anchored vector renders at its source point, not world origin',()=>{const r=ready(point('A',2,3)+point('B',4,5)+command('Vector',['A','B'],'v'));const svg=renderDirectSvg(r.document).svg;const line=svg.match(new RegExp('<line data-entity-id="'+r.labels.v+'"[^>]+>'))[0];assert.match(line,/marker-end="url\(#fme-arrow\)"/);assert.match(line,/x1="544"/);assert.match(line,/y1="224"/);});

// Fresh independent reference measurements, not expectations derived by this engine.
import reference from './geogebra-fixtures/review-reference.v2.mjs';
import {compareReference} from '../../../scripts/geogebra/compare-reference.mjs';
for(const fixture of reference.cases.filter(c=>c.id.startsWith('review-')))test(`real GeoGebra PR10 differential: ${fixture.id}`,async()=>{const result=await compareReference({...reference,cases:[fixture]});assert.equal(result.failed,0,JSON.stringify(result));assert.equal(result.passed,1);});
