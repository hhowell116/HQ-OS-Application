// Dev helper: renders a sprite sheet 3x with 17px-cell grid indices. Run: electron tools/sheetview.js <in.png> <out.png> [margin=1] [cell=16]
const { app, BrowserWindow } = require("electron"); const fs = require("fs");
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, width: 800, height: 600 });
  await w.loadURL("data:text/html,<body>");
  const B = fs.readFileSync(process.argv[2]).toString("base64"), cell = +(process.argv[5] || 16) + +(process.argv[4] || 1);
  const r = await w.webContents.executeJavaScript(`new Promise(res=>{const i=new Image();i.onload=()=>{const S=3,C=${cell},c=document.createElement('canvas');c.width=i.width*S+40;c.height=i.height*S+20;const x=c.getContext('2d');x.fillStyle='#456';x.fillRect(0,0,c.width,c.height);x.imageSmoothingEnabled=false;x.drawImage(i,20,20,i.width*S,i.height*S);x.font='10px monospace';x.fillStyle='#fff';x.strokeStyle='rgba(255,255,0,.35)';for(let cx=0;cx*C<i.width;cx++){x.fillText(cx,20+cx*C*S+2,12);x.beginPath();x.moveTo(20+cx*C*S,20);x.lineTo(20+cx*C*S,c.height);x.stroke()}for(let cy=0;cy*C<i.height;cy++){x.fillText(cy,2,20+cy*C*S+12);x.beginPath();x.moveTo(20,20+cy*C*S);x.lineTo(c.width,20+cy*C*S);x.stroke()}res(c.toDataURL().split(',')[1])};i.src='data:image/png;base64,${B}'})`);
  fs.writeFileSync(process.argv[3], Buffer.from(r, "base64")); app.exit(0);
});
