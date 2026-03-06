const COUNT = 24;
const LENGTH = 6;
const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function randomCode(len) {
  let s = '';
  const max = CHARSET.length;
  for (let i = 0; i < len; i++) {
    s += CHARSET.charAt(Math.floor(Math.random() * max));
  }
  return s;
}
const codes = Array.from({ length: COUNT }, () => randomCode(LENGTH));
console.log( codes.join('\n') );
