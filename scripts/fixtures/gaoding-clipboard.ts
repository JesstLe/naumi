// Synthetic fixture only: never commit copied customer text or signed asset URLs.
export function gaodingFixture() {
  const clip = (sourceUuid: string, left?: number, top?: number) => ({ sourceUuid, ...(left === undefined ? {} : { absolutePosition: { left, top } }) });
  const node = (id: string, type: string, left: number, top: number, previous: string[] = []) => ({ type, title: id, width: 2048, height: 1600, left, top, opacity: 1,
    fontSize: 90, fontWeight: 400, content: type === 'text' ? `# ${id}\n\n可编辑文字和提示词` : '', url: type === 'image' ? 'https://st0.dancf.com/fixture.png' : '',
    metaInfo: { $clipboard: clip(id), workflow: { previous, tool: { metadata: { sceneCode: 'Qwen-3-5-Plus', prompt: [{type:'text',content:'保留商品主体'}], parameters: {ratio:'9:16',quality:'high',isNetwork:false,privateKey:'must-not-import'} } } } } });
  return { version: '10.0.0', elements: [
    { type:'group',title:'商品工作流',width:10000,height:18000,left:-500,top:300,metaInfo:{$clipboard:clip('group-a',-500,300)},elements:[
      node('image-a','image',0,0), node('text-a','text',2400,0,['image-a']),
      { type:'group',title:'细节处理',width:5000,height:16000,left:4800,top:0,metaInfo:{$clipboard:clip('group-b')},elements:[
        {...node('text-b','text',0,0,['text-a']),height:50000},node('image-b','image',2400,0,['image-a','text-b']),
        {...node('vector','path',0,4000),path:'M0 0 L2048 0 L2048 1600 L0 1600 Z',pathEffects:[{enable:true,color:'#222222',width:2,filling:{color:'#ffffff00'}}]},
        {...node('svg','svg',0,6000),svg:'',content:'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><path d="M1 1L19 19" stroke="#224466"/></svg>'},
      ]},
    ]},
  ] };
}
export function clipboardHtml(data: unknown) { return `<span data-app="editor-next" data-clipboard="${Buffer.from(encodeURIComponent(JSON.stringify(data))).toString('base64')}"></span>`; }
