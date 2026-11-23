const { app, BrowserWindow } = require("electron"); const fs = require("fs");
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, width: 1800, height: 1400, webPreferences: { offscreen: true } });
  const dir = process.argv[2];
  await w.loadURL("data:text/html,<body style=margin:0;background:%23345>");
  for (const [f, out] of [["indoor", "indoor_grid"], ["chars", "chars_grid"]]) {
    const r = await w.webContents.executeJavaScript(`new Promise(res=>{const i=new Image();i.onload=()=>{const S=3,c=document.createElement('canvas');c.width=i.width*S+40;c.height=i.height*S+20;const x=c.getContext('2d');x.fillStyle='#456';x.fillRect(0,0,c.width,c.height);x.imageSmoothingEnabled=false;x.drawImage(i,20,20,i.width*S,i.height*S);x.font='10px monospace';x.fillStyle='#fff';x.strokeStyle='rgba(255,255,0,.35)';for(let cx=0;cx*17<i.width;cx++){x.fillText(cx,20+cx*17*S+2,12);x.beginPath();x.moveTo(20+cx*17*S,20);x.lineTo(20+cx*17*S,c.height);x.stroke()}for(let cy=0;cy*17<i.height;cy++){x.fillText(cy,2,20+cy*17*S+12);x.beginPath();x.moveTo(20,20+cy*17*S);x.lineTo(c.width,20+cy*17*S);x.stroke()}res(c.toDataURL().split(',')[1])};i.src='file:///${dir.replace(/\/g,"/")}/${f}.png'})`);
    fs.writeFileSync(dir + "/../" + out + ".png", Buffer.from(r, "base64"));
  }
  app.exit(0);
});
