import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

const textarea = document.getElementById('content');
const clearButton = document.getElementById('clear');
const statusEl = document.getElementById('status');

const DEBOUNCE_MS = 400;
let debounceTimer = null;
let lastKnownServerContent = '';

function setStatus(text) {
  statusEl.textContent = text;
}

async function ensurePostitId() {
  const params = new URLSearchParams(location.search);
  const existingId = params.get('id');
  if (existingId) return existingId;

  const id = crypto.randomUUID();
  const { error } = await supabase.from('postits').insert({ id, content: '' });
  if (error) {
    setStatus('No se pudo crear la nota.');
    throw error;
  }

  params.set('id', id);
  location.replace(`${location.pathname}?${params.toString()}`);
  return null; // navegación en curso, no seguir ejecutando
}

function applyRemoteContent(content) {
  lastKnownServerContent = content;
  if (content === textarea.value) return;
  textarea.value = content;
}

async function loadInitialContent(id) {
  const { data, error } = await supabase
    .from('postits')
    .select('content')
    .eq('id', id)
    .single();

  if (error || !data) {
    setStatus('Nota no encontrada. Escribe para crear una nueva en este enlace.');
    return;
  }

  applyRemoteContent(data.content ?? '');
}

function subscribeToChanges(id) {
  supabase
    .channel(`postit-${id}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'postits', filter: `id=eq.${id}` },
      (payload) => {
        const incoming = payload.new.content ?? '';
        // Eco de un guardado propio ya reflejado localmente: ignorar para no
        // pisar texto más nuevo que el usuario haya escrito mientras viajaba.
        if (incoming === lastKnownServerContent) return;
        applyRemoteContent(incoming);
      },
    )
    .subscribe((state) => {
      if (state === 'SUBSCRIBED') setStatus('Conectado');
      if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') setStatus('Sin conexión en tiempo real');
    });
}

function saveContent(id, content) {
  lastKnownServerContent = content;
  supabase.from('postits').update({ content }).eq('id', id).then(({ error }) => {
    if (error) setStatus('Error al guardar');
  });
}

async function init() {
  const id = await ensurePostitId();
  if (!id) return;

  await loadInitialContent(id);
  subscribeToChanges(id);

  textarea.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => saveContent(id, textarea.value), DEBOUNCE_MS);
  });

  clearButton.addEventListener('click', () => {
    clearTimeout(debounceTimer);
    textarea.value = '';
    saveContent(id, '');
  });
}

init();
