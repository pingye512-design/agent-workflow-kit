// Keep the historical app name/userData directory so existing sign-in state survives.
const {app,dialog}=require('electron');
const fs=require('fs'),path=require('path');
function report(error){
  let logfile='';
  try{const dir=app.getPath('userData');fs.mkdirSync(dir,{recursive:true});logfile=path.join(dir,'startup-error.log');fs.appendFileSync(logfile,new Date().toISOString()+' '+String(error&&error.stack||error)+'\n');}catch{}
  try{dialog.showErrorBox('RB小仁同学未能启动','请保留当前安装目录，查看启动日志后修复。\n'+logfile+'\n\n'+String(error&&error.message||error));}catch{}
}
process.on('uncaughtException',error=>{report(error);app.exit(1);});
process.on('unhandledRejection',error=>{report(error);});
try{require('./main.js');}catch(error){report(error);app.exit(1);}
