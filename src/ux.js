 /* ===== UX Library: Lottie animations ===== */
var UX={
  cache:{},
  loaded:{},
  async load(key){
    if(this.cache[key])return this.cache[key];
    try{
      var r=await fetch('/lottie/'+key+'.json');
      if(!r.ok)return null;
      var data=await r.json();
      this.cache[key]=data;
      return data;
    }catch(e){return null}
  },
  async play(container,key,opts){
    opts=opts||{};
    if(!container||!key)return;
    if(typeof lottie==='undefined')return;
    var data=await this.load(key);
    if(!data)return;
    try{
      if(this.loaded[key]){try{this.loaded[key].destroy()}catch(e){}}
      this.loaded[key]=lottie.loadAnimation({
        container:container,
        renderer:'svg',
        loop:!!opts.loop,
        autoplay:true,
        animationData:data
      });
    }catch(e){}
  },
  async toast(msg,key){
    var e=document.getElementById('ts');
    if(!e)return;
    if(key&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      e.innerHTML='';
      var wrap=document.createElement('div');
      wrap.style.cssText='display:flex;align-items:center;gap:10px;padding:4px';
      var box=document.createElement('div');
      box.style.cssText='width:32px;height:32px;flex:none';
      var txt=document.createElement('span');
      txt.textContent=msg;
      wrap.appendChild(box);
      wrap.appendChild(txt);
      e.appendChild(wrap);
      this.play(box,key);
    }else{
      e.textContent=msg;
    }
    e.style.display='block';
    clearTimeout(e.h);
    e.h=setTimeout(function(){e.style.display='none';e.innerHTML=''},3000);
  },
  async empty(container,key,text){
    if(!container)return;
    container.innerHTML='';
    var w=document.createElement('div');
    w.style.cssText='display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:40px 20px;text-align:center;color:var(--mu);margin:auto';
    var box=document.createElement('div');
    box.style.cssText='width:120px;height:120px';
    var txt=document.createElement('div');
    txt.textContent=text;
    w.appendChild(box);
    w.appendChild(txt);
    container.appendChild(w);
    if(key)this.play(box,key,{loop:true});
  },
  async celebrate(key,text,ms){
    ms=ms||2500;
    var d=document.createElement('div');
    d.style.cssText='position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,.6);z-index:100;gap:16px';
    var box=document.createElement('div');
    box.style.cssText='width:240px;height:240px';
    var txt=document.createElement('div');
    txt.style.cssText='color:#fff;font-size:20px;font-weight:700;text-align:center;max-width:80%';
    txt.textContent=text;
    d.appendChild(box);
    d.appendChild(txt);
    document.body.appendChild(d);
    this.play(box,key);
    if(navigator.vibrate){try{navigator.vibrate([40,60,40])}catch(e){}}
    setTimeout(function(){d.remove()},ms);
  }
};
