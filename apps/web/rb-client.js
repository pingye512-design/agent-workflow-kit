(function(){
  function syncName(){
    var name=document.body.classList.contains('sally-skin-creature')?'RB精灵':'RB小仁同学';
    document.title=name;
    document.querySelectorAll('.heroName,header h1,#side .sd-h>span:first-child,#sallyName').forEach(function(el){if(el.textContent!==name)el.textContent=name;});
  }
  syncName();
  new MutationObserver(syncName).observe(document.body,{attributes:true,attributeFilter:['class'],childList:true,subtree:true,characterData:true});
  var sw=window.RB_CONFIG&&window.RB_CONFIG.serviceWorker;
  if(sw&&'serviceWorker' in navigator&&!window.sallyPet){navigator.serviceWorker.register(sw).catch(function(e){console.warn('离线提示页未启用',e.message);});}
  var promptEvent;
  var button=document.createElement('button');button.id='rbInstall';button.type='button';button.textContent='安装到主屏幕';button.setAttribute('aria-label','安装 RB小仁同学');
  var standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone;
  if(!window.sallyPet&&!standalone){var header=document.querySelector('header');if(header)header.appendChild(button);}
  window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();promptEvent=e;});
  button.addEventListener('click',async function(){
    if(promptEvent){await promptEvent.prompt();promptEvent=null;return;}
    var old=document.getElementById('rbInstallHelp');if(old){old.remove();return;}
    var panel=document.createElement('section');panel.id='rbInstallHelp';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','安装到主屏幕');
    panel.innerHTML='<h2>把工作助手留在主屏幕</h2><p><b>iPad</b>：用 Safari 打开，点分享 → 添加到主屏幕 → 作为网页 App 打开。</p><p><b>安卓平板</b>：用 Chrome 打开，点菜单 → 安装应用或添加到主屏幕。</p><p>安装后独立窗口运行；问答与业务数据需要联网。</p><button type="button">知道了</button>';
    panel.querySelector('button').onclick=function(){panel.remove();button.focus();};document.body.appendChild(panel);panel.querySelector('button').focus();
  });
  window.addEventListener('appinstalled',function(){button.remove();});
})();
