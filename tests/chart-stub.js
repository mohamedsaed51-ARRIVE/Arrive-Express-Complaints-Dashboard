(function(){
  const deep=()=>new Proxy(function(){}, {get:(t,k)=>k===Symbol.toPrimitive?()=>'':deep(), set:()=>true, apply:()=>undefined});
  function Chart(ctx,cfg){ this.canvas=ctx.canvas||ctx; this.config=cfg; this.data=cfg.data; this.options=cfg.options||{}; Chart.instances.push(this); }
  Chart.instances=[]; Chart.prototype.update=function(){this.canvas.dataset.updated='1'; this.canvas.dataset.labels=JSON.stringify(this.data.labels||[]);}; Chart.prototype.destroy=function(){}; Chart.prototype.resize=function(){}; Chart.prototype.toBase64Image=function(){return '';};
  Chart.defaults={font:{},plugins:{tooltip:{}},scale:{},locale:'',color:''}; Chart.register=function(){};
  window.Chart=Chart;
})();
