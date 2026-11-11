import {unified} from "unified";
import remarkParse from "remark-parse";

type Node={type:string;children?:Node[];position?:{start:{offset?:number};end:{offset?:number}}};
const parser=unified().use(remarkParse);

/** Accept common LaTeX delimiters without altering stored messages or fenced /
 * inline code. KaTeX itself remains untrusted, bounded and read-only. */
export function conversationMarkdown(content:string):string {
  const protectedRanges:[number,number][]=[];
  function visit(node:Node){
    if(["code","inlineCode","html","link","image"].includes(node.type)&&node.position)protectedRanges.push([node.position.start.offset||0,node.position.end.offset||0]);
    else node.children?.forEach(visit);
  }
  visit(parser.parse(content) as Node);
  return content.replace(/\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/g,(whole:string,display:string|undefined,inline:string|undefined,index:number)=>{
    if(content[index-1]==="\\"||protectedRanges.some(([start,end])=>index<end&&index+whole.length>start))return whole;
    return display===undefined?`$${inline}$`:`\n$$\n${display}\n$$\n`;
  });
}
