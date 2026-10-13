/** Bounded XML reader for GeoGebra construction data. No DTDs, entities, network or scripts. */
export interface GgbXmlNode {
  name: string;
  attributes: Record<string, string>;
  children: GgbXmlNode[];
  text: string;
}
export class GgbImportError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "GgbImportError"; }
}
export function ggbFail(code: string, message: string): never { throw new GgbImportError(code, message); }
function decode(text: string): string {
  if (/&(?!amp;|lt;|gt;|quot;|apos;|#(?:[0-9]+|x[0-9a-fA-F]+);)/.test(text)) ggbFail("XML_ENTITY", "Malformed XML entity.");
  return text.replace(/&([^;\s]+);/g, (_, entity: string) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (Object.hasOwn(named, entity)) return named[entity]!;
    const match = /^#(x[0-9a-f]+|[0-9]+)$/i.exec(entity);
    if (!match) return ggbFail("XML_ENTITY", `Unsupported entity &${entity};`);
    const value = match[1]!.toLowerCase().startsWith("x") ? parseInt(match[1]!.slice(1), 16) : Number(match[1]);
    if (!Number.isInteger(value) || value < 1 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) ggbFail("XML_ENTITY", "Invalid character reference.");
    return String.fromCodePoint(value);
  });
}
export function parseGgbXml(xml: string): GgbXmlNode {
  xml=xml.replace(/^\uFEFF/, "");
  if (new TextEncoder().encode(xml).length > 4 * 1024 * 1024) ggbFail("XML_LIMIT", "XML exceeds 4 MiB.");
  if (/<!\s*(DOCTYPE|ENTITY)/i.test(xml) || xml.includes("\0")) ggbFail("XML_UNSAFE", "DTD, external entities and NUL are rejected.");
  const root: GgbXmlNode = { name: "$document", attributes: Object.create(null), children: [], text: "" };
  const stack = [root]; let pos = 0; let count = 0;
  while (pos < xml.length) {
    const open = xml.indexOf("<", pos);
    if (open < 0) { stack.at(-1)!.text += decode(xml.slice(pos)); break; }
    stack.at(-1)!.text += decode(xml.slice(pos, open));
    if (xml.startsWith("<!--", open)) {
      const end = xml.indexOf("-->", open + 4); if (end < 0) ggbFail("XML_SYNTAX", "Unclosed comment."); pos = end + 3; continue;
    }
    if (xml.startsWith("<![CDATA[", open)) {
      const end = xml.indexOf("]]>", open + 9); if (end < 0) ggbFail("XML_SYNTAX", "Unclosed CDATA.");
      stack.at(-1)!.text += xml.slice(open + 9, end); pos = end + 3; continue;
    }
    if (xml.startsWith("<?", open)) {
      const end = xml.indexOf("?>", open + 2);
      if (root.children.length || stack.length !== 1 || end < 0 || !/^<\?xml\s/i.test(xml.slice(open, end + 2))) ggbFail("XML_UNSAFE", "Only the XML declaration is supported.");
      pos = end + 2; continue;
    }
    let end = open + 1; let quote = "";
    for (; end < xml.length; end++) {
      const char = xml[end]!;
      if (quote) { if (char === quote) quote = ""; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === ">") break;
      else if (char === "<") ggbFail("XML_SYNTAX", "Unexpected '<' in tag.");
    }
    if (end === xml.length) ggbFail("XML_SYNTAX", "Unclosed tag.");
    const tag = xml.slice(open + 1, end).trim(); pos = end + 1;
    if (tag.startsWith("/")) {
      if (stack.length < 2 || stack.at(-1)!.name !== tag.slice(1).trim()) ggbFail("XML_SYNTAX", "Mismatched closing tag.");
      stack.pop(); continue;
    }
    const match = /^([A-Za-z_][\w:.-]*)([\s\S]*?)(\/?)$/.exec(tag);
    if (!match) ggbFail("XML_SYNTAX", "Invalid tag.");
    const node: GgbXmlNode = { name: match[1]!, attributes: Object.create(null), children: [], text: "" };
    let rest = match[2]!;
    while (rest.trim()) {
      const attr = /^\s+([A-Za-z_][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/.exec(rest);
      if (!attr) ggbFail("XML_SYNTAX", "Invalid XML attribute.");
      if (Object.hasOwn(node.attributes, attr[1]!)) ggbFail("XML_SYNTAX", "Duplicate attribute.");
      if((attr[3]??attr[4]??"").includes("<")) ggbFail("XML_SYNTAX","Unescaped less-than in attribute.");
      node.attributes[attr[1]!] = decode(attr[3] ?? attr[4] ?? ""); rest = rest.slice(attr[0].length);
    }
    if (++count > 30000 || stack.length > 64) ggbFail("XML_LIMIT", "XML node/depth limit exceeded.");
    stack.at(-1)!.children.push(node); if (!match[3]) stack.push(node);
  }
  if (stack.length !== 1 || root.children.length !== 1 || root.text.trim()) ggbFail("XML_SYNTAX", "Exactly one closed XML root is required.");
  if (root.children[0]!.name !== "geogebra") ggbFail("XML_ROOT", "Expected geogebra root.");
  return root.children[0]!;
}
export function child(node: GgbXmlNode | undefined, name: string): GgbXmlNode | undefined { return node?.children.find(n => n.name === name); }
export function indexed(node: GgbXmlNode | undefined): string[] {
  if (!node) return [];
  const keys = Object.keys(node.attributes).filter(k => /^a\d+$/.test(k)).sort((a,b) => Number(a.slice(1))-Number(b.slice(1)));
  if (keys.some((k,i) => k !== `a${i}`)) ggbFail("XML_INDEX", "Non-contiguous input/output indices.");
  return keys.map(k => node.attributes[k]!);
}
