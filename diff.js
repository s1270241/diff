/* ========================================
   ユーティリティ関数
   ======================================== */

// getElementById の短縮
const byId = (id) => document.getElementById(id);

// HTMLに埋め込む文字列のエスケープ（XSS対策）
function escapeHtml(s){
  return s.replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}

/* ========================================
   前処理：改行正規化／末尾空白削除／大文字小文字無視
   ======================================== */
function preprocess(text, { ignoreCase, trimEnd }) {
  // 改行コードを \n に統一
  let t = text.replace(/\r\n?/g, '\n');

  // 行末の空白を削除（オプション）
  if (trimEnd) {
    t = t.split('\n').map(l => l.replace(/\s+$/,'')).join('\n');
  }

  // 大文字小文字を無視（オプション）
  if (ignoreCase) t = t.toLowerCase();

  return t;
}

/* ========================================
   行単位の差分（LCS: 最長共通部分列）
   - equal / insert / delete を算出
   - delete + insert を modify に統合
   ======================================== */
function diffLines(aText, bText) {
  const A = aText.split('\n');  // 旧
  const B = bText.split('\n');  // 新
  const n = A.length, m = B.length;

  // LCS DPテーブル（dp[i][j] は A[0..i-1],B[0..j-1] のLCS長）
  const dp = Array.from({length:n+1},()=>new Array(m+1).fill(0));
  for (let i=1;i<=n;i++){
    for (let j=1;j<=m;j++){
      dp[i][j] = (A[i-1]===B[j-1]) ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j], dp[i][j-1]);
    }
  }

  // 復元
  const ops = [];
  let i=n, j=m;
  while (i>0 || j>0) {
    if (i>0 && j>0 && A[i-1]===B[j-1]) {
      ops.push({ type:'equal', a:A[i-1], b:B[j-1] }); i--; j--;
    } else if (j>0 && (i===0 || dp[i][j-1] >= dp[i-1][j])) {
      ops.push({ type:'insert', a:'', b:B[j-1] }); j--;
    } else if (i>0 && (j===0 || dp[i][j-1] < dp[i-1][j])) {
      ops.push({ type:'delete', a:A[i-1], b:'' }); i--;
    }
  }
  ops.reverse();

  // delete の直後の insert を modify に束ねる
  const merged = [];
  for (let k=0;k<ops.length;k++){
    const cur = ops[k];
    const prev = merged[merged.length-1];
    if (prev && prev.type==='delete' && cur.type==='insert') {
      merged[merged.length-1] = { type:'modify', a:prev.a, b:cur.b };
    } else {
      merged.push(cur);
    }
  }
  return { ops: merged };
}

/* ========================================
   行内（単語/トークン）レベルの差分（LCS）
   - modify（変更）行のみ対象
   ======================================== */
function wordDiff(aLine, bLine) {
  // トークン分割：Unicodeの文字クラスで「単語」「空白」「記号」を抽出
  const tok = s => s.match(/[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]|[\s]+/gu) || [];
  const A = tok(aLine), B = tok(bLine);
  const n=A.length, m=B.length;

  // LCS DPテーブル（トークン列）
  const dp = Array.from({length:n+1},()=>new Array(m+1).fill(0));
  for (let i=1;i<=n;i++){
    for (let j=1;j<=m;j++){
      dp[i][j] = (A[i-1]===B[j-1]) ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j], dp[i][j-1]);
    }
  }

  // 復元して行内HTMLを構築
  const partsA=[], partsB=[];
  let i=n, j=m;
  while (i>0 || j>0) {
    if (i>0 && j>0 && A[i-1]===B[j-1]) {
      partsA.push(escapeHtml(A[i-1]));
      partsB.push(escapeHtml(B[j-1]));
      i--; j--;
    } else if (j>0 && (i===0 || dp[i][j-1] >= dp[i-1][j])) {
      partsB.push(`<mark class="add">${escapeHtml(B[j-1])}</mark>`); j--;
    } else if (i>0 && (j===0 || dp[i][j-1] < dp[i-1][j])) {
      partsA.push(`<mark class="del">${escapeHtml(A[i-1])}</mark>`); i--;
    }
  }
  return { aHtml: partsA.reverse().join(''), bHtml: partsB.reverse().join('') };
}

/* ========================================
   レンダリング：#grid に差分を2カラムで描画
   ======================================== */
function renderDiff(container, ops, { inlineWords }) {
  container.innerHTML = '';
  let lnA=0, lnB=0;
  let add=0, del=0, mod=0, eq=0;

  for (const op of ops) {
    // 左右セル
    const left = document.createElement('div');
    const right = document.createElement('div');

    left.className  = 'cell ' + (op.type==='insert' ? 'eq' : op.type==='delete' ? 'del' : op.type==='modify' ? 'mod' : 'eq');
    right.className = 'cell ' + (op.type==='delete' ? 'eq' : op.type==='insert' ? 'ins' : op.type==='modify' ? 'mod' : 'eq');

    // 行番号・本文
    const lnLeft = document.createElement('div');  lnLeft.className = 'ln';
    const lnRight= document.createElement('div');  lnRight.className= 'ln';
    const codeLeft = document.createElement('div'); codeLeft.className = 'code';
    const codeRight= document.createElement('div'); codeRight.className= 'code';

    if (op.type==='insert') {           // 右のみ本文
      lnLeft.textContent = ''; codeLeft.textContent = '';
      lnB++; lnRight.textContent = lnB; codeRight.innerHTML = escapeHtml(op.b);
    } else if (op.type==='delete') {    // 左のみ本文
      lnA++; lnLeft.textContent = lnA; codeLeft.innerHTML = escapeHtml(op.a);
      lnRight.textContent = ''; codeRight.textContent = '';
    } else if (op.type==='modify') {    // 双方本文（変更）
      lnA++; lnLeft.textContent = lnA;
      lnB++; lnRight.textContent = lnB;
      if (inlineWords) {
        const { aHtml, bHtml } = wordDiff(op.a, op.b);
        codeLeft.innerHTML = aHtml;
        codeRight.innerHTML = bHtml;
      } else {
        codeLeft.innerHTML = escapeHtml(op.a);
        codeRight.innerHTML = escapeHtml(op.b);
      }
    } else {                            // equal
      lnA++; lnLeft.textContent = lnA; codeLeft.innerHTML = escapeHtml(op.a);
      lnB++; lnRight.textContent = lnB; codeRight.innerHTML = escapeHtml(op.b);
    }

    left.prepend(lnLeft); left.appendChild(codeLeft);
    right.prepend(lnRight); right.appendChild(codeRight);
    container.appendChild(left);
    container.appendChild(right);

    if (op.type==='equal') eq++;
    if (op.type==='insert') add++;
    if (op.type==='delete') del++;
    if (op.type==='modify') mod++;
  }

  return { add, del, mod, eq };
}

/* ========================================
   イベント配線：ボタン操作 → 差分計算／描画
   ======================================== */
const left     = byId('left');
const right    = byId('right');
const compare  = byId('compare');
const swapBtn  = byId('swap');
const clearBtn = byId('clear');
const ignoreCase = byId('ignoreCase');
const trimEnd    = byId('trimEnd');
const inlineWords= byId('inlineWords');
const statsEl    = byId('stats');
const grid       = byId('grid');

// 「比較」クリック：前処理 → 行差分 → レンダリング → 統計表示
compare.addEventListener('click', () => {
  const opt = { ignoreCase: ignoreCase.checked, trimEnd: trimEnd.checked };
  const a = preprocess(left.value, opt);
  const b = preprocess(right.value, opt);
  const { ops } = diffLines(a, b);
  const { add, del, mod, eq } = renderDiff(grid, ops, { inlineWords: inlineWords.checked });
  statsEl.textContent = `共通:${eq}  追加(+):${add}  削除(-):${del}  変更(±):${mod}`;
});

// 「左右入れ替え」クリック
swapBtn.addEventListener('click', () => {
  [left.value, right.value] = [right.value, left.value];
});

// 「クリア」クリック
clearBtn.addEventListener('click', () => {
  left.value=''; right.value=''; grid.innerHTML=''; statsEl.textContent='—';
});

/* ========================================
   デモ用プレースホルダ（初期値）
   実運用時は削除してOK
   ======================================== */
left.value =
`function hello(name) {
  console.log("Hello, " + name + "!");
}

const nums = [1,2,3];
for (let i=0;i<nums.length;i++){
  // TODO: sum
  console.log(nums[i]);
}`;
right.value =
`function hello(name, excited=false) {
  const base = "Hello, " + name;
  console.log(excited ? base + "!!!" : base + "!");
}

const numbers = [1, 2, 3, 4];
for (const n of numbers) {
  console.log(n);
}
// sum:
console.log(numbers.reduce((a,b)=>a+b,0));`;
