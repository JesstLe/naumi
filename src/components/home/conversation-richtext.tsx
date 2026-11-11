"use client";

import {Children,isValidElement,memo,useEffect,useState,type ReactNode} from "react";
import Markdown,{type Components} from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import {Check,Copy} from "lucide-react";
import {assistantUrl} from "@/lib/canvas/assistant-richtext";
import {conversationMarkdown} from "@/lib/agent/conversation-markdown";
import styles from "./creation-workbench.module.css";

function plain(children:ReactNode):string{return Children.toArray(children).map(child=>typeof child==="string"||typeof child==="number"?String(child):isValidElement<{children?:ReactNode}>(child)?plain(child.props.children):"").join("");}
function CodeBlock({children}:{children:ReactNode}){
  const [copied,setCopied]=useState(false),[error,setError]=useState(false);
  useEffect(()=>{if(!copied)return;const timer=setTimeout(()=>setCopied(false),1500);return()=>clearTimeout(timer);},[copied]);
  const element=Children.toArray(children).find(isValidElement),className=isValidElement<{className?:string}>(element)?element.props.className||"":"",language=/language-([\w+-]+)/.exec(className)?.[1]||"代码";
  return <div className={styles.conversationCode}><header><span>{language}</span><button type="button" aria-label="复制代码" onClick={()=>void navigator.clipboard.writeText(plain(children).replace(/\n$/,"" )).then(()=>{setCopied(true);setError(false);}).catch(()=>setError(true))}>{copied?<Check/>:<Copy/>}{copied?"已复制":"复制"}</button></header><pre tabIndex={0}>{children}</pre>{error&&<p role="status">复制失败，请选择代码复制</p>}</div>;
}

const remarkPlugins=[remarkGfm,remarkMath];
const rehypePlugins:NonNullable<React.ComponentProps<typeof Markdown>["rehypePlugins"]>=[
  [rehypeKatex,{throwOnError:false,trust:false,strict:"ignore",maxExpand:1000,maxSize:20}],
  [rehypeHighlight,{detect:false,ignoreMissing:true}],
];
const base:Components={
  pre:({children})=><CodeBlock>{children}</CodeBlock>,
  table:({children})=><div className={styles.conversationTable} role="region" aria-label="表格" tabIndex={0}><table>{children}</table></div>,
  a:({href,children})=>href?<a href={href} target={href.startsWith("#")?undefined:"_blank"} rel="noopener noreferrer">{children}</a>:<span>{children}</span>,
};
/** Read-only Markdown + mathematical typography. Stored text is never rewritten;
 * incomplete streamed formulas remain visible and cannot enable HTML actions. */
export const ConversationRichText=memo(function ConversationRichText({content,components}:{content:string;components?:Components}){
  return <div className={styles.responseMarkdown} data-testid="conversation-richtext"><Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} skipHtml urlTransform={assistantUrl} components={{...base,...components}}>{conversationMarkdown(content)}</Markdown></div>;
});
