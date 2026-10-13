import path from 'node:path';

const namePattern=/^[A-Za-z0-9_%.$-]+(?:\/[A-Za-z0-9_%.$-]+)*$/;
function localReference(value,template=false){
  // DASH %05d inside a $Number...$ template is formatting syntax, not a
  // percent-encoded URI byte. Decode actual URI escapes without destroying it.
  const source=template?value.replace(/(\$(?:RepresentationID|Bandwidth|Number|Time))%0(\d{1,2})d\$/g,'$1%250$2d$'):value;
  let decoded;try{decoded=decodeURIComponent(source.trim());}catch{throw new Error('MEDIA_BUNDLE_REFERENCE_ENCODING');}
  if(!decoded||decoded.length>300||!namePattern.test(decoded.replace(/\/$/,''))||decoded.split('/').some(part=>part==='.'||part==='..'))throw new Error('MEDIA_BUNDLE_REFERENCE_FORBIDDEN');
  return decoded;
}
function decodeXml(value){
  return value.replace(/&([^;]+);/g,(_match,entity)=>{
    const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};if(entity in named)return named[entity];
    const number=/^#x[0-9a-f]+$/i.test(entity)?parseInt(entity.slice(2),16):/^#\d+$/.test(entity)?Number(entity.slice(1)):NaN;
    if(!Number.isInteger(number)||number<32||number>0x10ffff||number>=0xd800&&number<=0xdfff)throw new Error('MEDIA_BUNDLE_XML_ENTITY');
    return String.fromCodePoint(number);
  });
}
// Parse the small XML subset emitted by DASH muxers. No DTD, external entities,
// processing instructions, XInclude or XML library network access is available.
function parseMpd(text){
  if(text.length>1024*1024||/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(text))throw new Error('MEDIA_BUNDLE_XML_FORBIDDEN');
  const source=text.replace(/^\uFEFF/,'').replace(/^\s*<\?xml[^?]*\?>/,'').replace(/<!--[\s\S]*?-->/g,'');
  const document={name:'document',attrs:{},children:[],text:''},stack=[document];let cursor=0;
  const tokens=/<[^>]*>/g;let match;
  while((match=tokens.exec(source))){
    const gap=source.slice(cursor,match.index);if(gap.includes('<'))throw new Error('MEDIA_BUNDLE_XML_INVALID');stack.at(-1).text+=decodeXml(gap);cursor=tokens.lastIndex;
    const closing=/^<\/([\w:.-]+)\s*>$/.exec(match[0]);
    if(closing){if(stack.length<2||stack.at(-1).fullName!==closing[1])throw new Error('MEDIA_BUNDLE_XML_INVALID');stack.pop();continue;}
    const open=/^<([\w:.-]+)((?:\s+[\s\S]*)?)\/?\s*>$/.exec(match[0]);if(!open)throw new Error('MEDIA_BUNDLE_XML_INVALID');
    const selfClosing=/\/\s*>$/.test(match[0]),tail=open[2].replace(/\/\s*$/,'');
    const attrs={},attributes=/\s+([\w:.-]+)\s*=\s*("[^"]*"|'[^']*')/gy;let offset=0,attribute;
    while((attribute=attributes.exec(tail))){if(Object.hasOwn(attrs,attribute[1]))throw new Error('MEDIA_BUNDLE_XML_INVALID');attrs[attribute[1]]=decodeXml(attribute[2].slice(1,-1));offset=attributes.lastIndex;}
    if(tail.slice(offset).trim())throw new Error('MEDIA_BUNDLE_XML_INVALID');
    const node={fullName:open[1],name:open[1].split(':').at(-1),attrs,children:[],text:''};
    if(node.name==='Include'||Object.keys(attrs).some(key=>key.split(':').at(-1)==='href'))throw new Error('MEDIA_BUNDLE_EXTERNAL_REFERENCE');
    stack.at(-1).children.push(node);if(!selfClosing)stack.push(node);if(stack.length>64)throw new Error('MEDIA_BUNDLE_XML_DEPTH');
  }
  if(source.slice(cursor).trim()||stack.length!==1||document.children.length!==1||document.children[0].name!=='MPD')throw new Error('MEDIA_BUNDLE_XML_INVALID');
  return document.children[0];
}
function templatePattern(reference){
  let expression='^',cursor=0;const tokens=/\$(RepresentationID|Bandwidth|Number|Time)(?:%0(\d{1,2})d)?\$|\$\$/g;let match;
  const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  while((match=tokens.exec(reference))){
    expression+=escape(reference.slice(cursor,match.index));cursor=tokens.lastIndex;
    expression+=match[0]==='$$'?'\\$':match[1]==='RepresentationID'?'[A-Za-z0-9_.-]+':match[2]?`[0-9]{${Number(match[2])},}`:'[0-9]+';
  }
  expression+=escape(reference.slice(cursor))+'$';if(reference.replace(tokens,'').includes('$'))throw new Error('MEDIA_BUNDLE_TEMPLATE_INVALID');return new RegExp(expression);
}
/** All references must resolve within this exact produced inventory before any
 * playlist is decoded or exported. Returns fragments that require their manifest
 * context rather than probing encrypted TS or fMP4 chunks as standalone media. */
export function inspectMediaBundle(name,text,produced){
  const names=new Set(produced),fragments=new Set(),references=new Set();const directory=path.posix.dirname(name)==='.'?'':`${path.posix.dirname(name)}/`;
  const resolve=(base,value,template=false)=>{
    const reference=base+localReference(value,template),matches=template?[...names].filter(candidate=>templatePattern(reference).test(candidate)):names.has(reference)?[reference]:[];
    if(!matches.length)throw new Error('MEDIA_BUNDLE_REFERENCE_MISSING');
    for(const file of matches){references.add(file);if(!/\.(m3u8|mpd|key|vtt|srt)$/i.test(file))fragments.add(file);}return reference;
  };
  if(/\.m3u8$/i.test(name)){
    if(!text.replace(/^\uFEFF/,'').startsWith('#EXTM3U')||text.length>1024*1024)throw new Error('MEDIA_BUNDLE_PLAYLIST_INVALID');
    for(const raw of text.split(/\r?\n/)){
      const line=raw.trim();if(!line)continue;
      if(!line.startsWith('#')){resolve(directory,line);continue;}
      for(const uri of line.matchAll(/(?:^|[:,])(?:[A-Z-]*URI)="([^"]*)"/g))resolve(directory,uri[1]);
      if(/(?:^|[:,])(?:[A-Z-]*URI)=/.test(line)&&!/(?:^|[:,])(?:[A-Z-]*URI)="[^"]*"/.test(line))throw new Error('MEDIA_BUNDLE_PLAYLIST_URI_INVALID');
    }
  }else if(/\.mpd$/i.test(name)){
    const visit=(node,bases)=>{
      if(['Location','PatchLocation','UTCTiming','ContentSteering'].includes(node.name))throw new Error('MEDIA_BUNDLE_EXTERNAL_REFERENCE');
      const children=node.children.filter(child=>child.name==='BaseURL');
      const next=children.length?bases.flatMap(base=>children.map(child=>{
        const value=localReference(child.text),joined=base+value;
        if(!value.endsWith('/'))resolve(base,value);else if(![...names].some(file=>file.startsWith(joined)))throw new Error('MEDIA_BUNDLE_REFERENCE_MISSING');return joined;
      })):bases;
      for(const key of ['media','initialization','sourceURL','index'])if(node.attrs[key])for(const base of next)resolve(base,node.attrs[key],node.attrs[key].includes('$'));
      for(const child of node.children)if(child.name!=='BaseURL')visit(child,next);
    };
    visit(parseMpd(text),[directory]);
  }else throw new Error('MEDIA_BUNDLE_MANIFEST_REQUIRED');
  if(!references.size)throw new Error('MEDIA_BUNDLE_EMPTY');return {references:[...references],fragments:[...fragments]};
}
