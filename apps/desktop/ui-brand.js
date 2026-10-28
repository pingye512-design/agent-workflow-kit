(function(){
  function syncName(){
    var name=document.body.classList.contains('sally-skin-creature')?'RB精灵':'RB小仁同学';
    document.title=name;
    document.querySelectorAll('.heroName,header h1,#side .sd-h>span:first-child,#sallyName').forEach(function(el){if(el.textContent!==name)el.textContent=name;});
  }
  syncName();
  new MutationObserver(syncName).observe(document.body,{attributes:true,attributeFilter:['class'],childList:true,subtree:true,characterData:true});
})();