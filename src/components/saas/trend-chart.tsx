'use client';
import {useEffect,useRef} from 'react';
export function TrendChart({items}:{items:{date:string;count:number}[]}){
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{const element=canvas.current;if(!element)return;
  const draw=()=>{const width=element.clientWidth,height=242,density=window.devicePixelRatio||1;element.width=width*density;element.height=height*density;const ctx=element.getContext('2d');if(!ctx)return;ctx.scale(density,density);const left=42,right=20,top=16,bottom=34,w=width-left-right,h=height-top-bottom,max=Math.max(4,...items.map(x=>x.count)),ceiling=Math.ceil(max/4)*4;
   ctx.font='12px system-ui, sans-serif';ctx.lineWidth=1;ctx.textAlign='right';ctx.fillStyle='#69809e';
   for(let i=0;i<=4;i++){const y=top+h-h*i/4;ctx.beginPath();ctx.strokeStyle='#e3e9f1';ctx.moveTo(left,y);ctx.lineTo(width-right,y);ctx.stroke();ctx.fillText(String(ceiling*i/4),left-9,y+4);}
   const points=items.map((x,i)=>({x:left+i*w/Math.max(1,items.length-1),y:top+h-h*x.count/ceiling}));
   if(points.length){ctx.beginPath();ctx.moveTo(points[0].x,top+h);for(const p of points)ctx.lineTo(p.x,p.y);ctx.lineTo(points[points.length-1].x,top+h);ctx.closePath();ctx.fillStyle='rgba(23,98,220,0.12)';ctx.fill();ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle='#1762dc';ctx.lineWidth=2;ctx.stroke();}
   points.forEach((p,i)=>{ctx.beginPath();ctx.arc(p.x,p.y,4.5,0,Math.PI*2);ctx.fillStyle='#1762dc';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();ctx.fillStyle='#69809e';ctx.textAlign='center';ctx.fillText(items[i].date.slice(5).replace('-','.'),p.x,height-9);});
  };const observer=new ResizeObserver(draw);observer.observe(element);draw();return()=>observer.disconnect();
 },[items]);
 return <div><canvas ref={canvas} style={{width:'100%',height:242,display:'block'}} role="img" aria-label="每日已接受顶层创作折线面积图"/><details style={{fontSize:12,color:'#647993',marginTop:5}}><summary style={{cursor:'pointer'}}>查看每日数据</summary><table style={{width:'100%',textAlign:'left'}}><thead><tr><th>日期</th><th>创作数</th></tr></thead><tbody>{items.map(x=><tr key={x.date}><td>{x.date}</td><td>{x.count}</td></tr>)}</tbody></table></details></div>;
}
