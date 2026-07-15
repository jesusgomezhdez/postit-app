import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

const MAX_POSTITS = 10;
const DEBOUNCE_MS = 400;

const boardEl = document.getElementById('board');
const addButton = document.getElementById('add-postit');
const countEl = document.getElementById('postit-count');
const template = document.getElementById('postit-template');

const postits = new Map(); // id -> { row, el, textarea, statusEl, debounceTimer, lastKnownServerContent }

function ensureBoardId() {
  const params = new URLSearchParams(location.search);
  return params.get('board') || params.get('id');
}

async function createBoard() {
  const boardId = crypto.randomUUID();
  const { error } = await supabase
    .from('postits')
    .insert({ id: crypto.randomUUID(), board_id: boardId, content: '', position: 0, color: 'yellow' });
  if (error) throw error;

  const params = new URLSearchParams(location.search);
  params.set('board', boardId);
  params.delete('id');
  location.replace(`${location.pathname}?${params.toString()}`);
}

async function loadBoard(boardId) {
  const { data, error } = await supabase
    .from('postits')
    .select('id, content, color, position')
    .eq('board_id', boardId)
    .order('position', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

function updateAddButtonState() {
  countEl.textContent = `(${postits.size}/${MAX_POSTITS})`;
  addButton.disabled = postits.size >= MAX_POSTITS;
}

function setStatus(postitId, text) {
  const state = postits.get(postitId);
  if (state) state.statusEl.textContent = text;
}

function applyColor(postitId, color) {
  const state = postits.get(postitId);
  if (!state) return;
  state.el.dataset.color = color;
  state.el.querySelectorAll('.swatch').forEach((swatch) => {
    swatch.classList.toggle('active', swatch.dataset.color === color);
  });
}

function applyRemoteContent(postitId, content) {
  const state = postits.get(postitId);
  if (!state) return;
  state.lastKnownServerContent = content;
  if (content === state.textarea.value) return;
  state.textarea.value = content;
}

function saveContent(postitId, content) {
  const state = postits.get(postitId);
  if (!state) return;
  state.lastKnownServerContent = content;
  supabase.from('postits').update({ content }).eq('id', postitId).then(({ error }) => {
    if (error) setStatus(postitId, 'Error al guardar');
  });
}

function setColor(postitId, color) {
  if (!postits.has(postitId)) return;
  applyColor(postitId, color);
  supabase.from('postits').update({ color }).eq('id', postitId).then(({ error }) => {
    if (error) setStatus(postitId, 'Error al guardar color');
  });
}

function renderPostit(row) {
  const fragment = template.content.cloneNode(true);
  const el = fragment.querySelector('.postit');
  const textarea = fragment.querySelector('.content');
  const statusEl = fragment.querySelector('.status');
  const clearButton = fragment.querySelector('.clear');
  const swatches = [...fragment.querySelectorAll('.swatch')];

  el.dataset.color = row.color;
  textarea.value = row.content ?? '';
  swatches.forEach((swatch) => swatch.classList.toggle('active', swatch.dataset.color === row.color));

  const state = {
    row,
    el,
    textarea,
    statusEl,
    debounceTimer: null,
    lastKnownServerContent: row.content ?? '',
  };
  postits.set(row.id, state);

  textarea.addEventListener('input', () => {
    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(() => saveContent(row.id, textarea.value), DEBOUNCE_MS);
  });

  clearButton.addEventListener('click', () => {
    clearTimeout(state.debounceTimer);
    textarea.value = '';
    saveContent(row.id, '');
  });

  swatches.forEach((swatch) => {
    swatch.addEventListener('click', () => setColor(row.id, swatch.dataset.color));
  });

  boardEl.appendChild(el);
}

async function addPostit(boardId) {
  if (postits.size >= MAX_POSTITS) return;

  addButton.disabled = true;
  const maxPosition = Math.max(-1, ...[...postits.values()].map((state) => state.row.position));
  const row = {
    id: crypto.randomUUID(),
    board_id: boardId,
    content: '',
    color: 'yellow',
    position: maxPosition + 1,
  };

  const { error } = await supabase.from('postits').insert(row);
  if (error) {
    updateAddButtonState();
    return;
  }
  renderPostit(row);
  updateAddButtonState();
}

function subscribeToChanges(boardId) {
  supabase
    .channel(`board-${boardId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'postits', filter: `board_id=eq.${boardId}` },
      (payload) => {
        if (postits.has(payload.new.id)) return;
        renderPostit(payload.new);
        updateAddButtonState();
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'postits', filter: `board_id=eq.${boardId}` },
      (payload) => {
        const state = postits.get(payload.new.id);
        if (!state) return;

        const incoming = payload.new.content ?? '';
        // Eco de un guardado propio ya reflejado localmente: ignorar para no
        // pisar texto más nuevo que el usuario haya escrito mientras viajaba.
        if (incoming !== state.lastKnownServerContent) applyRemoteContent(payload.new.id, incoming);
        if (payload.new.color !== state.el.dataset.color) applyColor(payload.new.id, payload.new.color);
      },
    )
    .subscribe();
}

async function init() {
  const boardId = ensureBoardId();
  if (!boardId) {
    await createBoard();
    return; // navegación en curso, no seguir ejecutando
  }

  const rows = await loadBoard(boardId);
  if (rows.length === 0) {
    boardEl.innerHTML = '<p class="empty-state">Tablero no encontrado.</p>';
    addButton.disabled = true;
    return;
  }

  rows.forEach(renderPostit);
  updateAddButtonState();
  subscribeToChanges(boardId);

  addButton.addEventListener('click', () => addPostit(boardId));
}

init();
