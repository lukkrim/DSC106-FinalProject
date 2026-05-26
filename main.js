import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

const DATA_URL = 'data/spotify_songs.csv';
const TRACK_COUNT = 5;

const GENRES = [
  { id: 'edm', label: 'EDM' },
  { id: 'rap', label: 'Rap' },
  { id: 'r&b', label: 'R&B' },
  { id: 'latin', label: 'Latin' },
  { id: 'pop', label: 'Pop' },
  { id: 'rock', label: 'Rock' },
];

const FEATURE_LABELS = {
  danceability: 'danceability',
  energy: 'energy',
  valence: 'valence',
  acousticness: 'acousticness',
  speechiness: 'speechiness',
  instrumentalness: 'instrumentalness',
  liveness: 'liveness',
  tempo: 'tempo',
};

const FINGERPRINT_FEATURES = [
  { key: 'danceability', label: 'Danceability' },
  { key: 'energy', label: 'Energy' },
  { key: 'valence', label: 'Mood' },
  { key: 'acousticness', label: 'Acousticness' },
  { key: 'speechiness', label: 'Speechiness' },
  { key: 'instrumentalness', label: 'Instrumentalness' },
  { key: 'liveness', label: 'Liveness' },
  { key: 'tempo', label: 'Tempo', format: (value) => `${Math.round(value)} BPM` },
];

const GENRE_COLORS = {
  pop: '#4a7fd4',
  rap: '#d85a5a',
  rock: '#7b5fd4',
  latin: '#d4922a',
  'r&b': '#d4569a',
  edm: '#2a9d6f',
};

const EXPLORER_FEATURES = [
  { key: 'danceability', label: 'Danceability' },
  { key: 'energy', label: 'Energy' },
  { key: 'valence', label: 'Mood' },
  { key: 'acousticness', label: 'Acousticness' },
  { key: 'speechiness', label: 'Speechiness' },
  { key: 'instrumentalness', label: 'Instrumentalness' },
  { key: 'tempo', label: 'Tempo', format: (value) => `${Math.round(value)} BPM` },
];

let spotifyApiPromise = null;
let spotifyController = null;
let spotifyIsPaused = true;
let spotifyIsReady = false;

function parseRow(row) {
  return {
    track_id: row.track_id,
    track_name: row.track_name,
    track_artist: row.track_artist,
    track_popularity: +row.track_popularity,
    playlist_genre: row.playlist_genre,
    danceability: +row.danceability,
    energy: +row.energy,
    valence: +row.valence,
    acousticness: +row.acousticness,
    speechiness: +row.speechiness,
    instrumentalness: +row.instrumentalness,
    liveness: +row.liveness,
    tempo: +row.tempo,
  };
}

function dedupeByTrackId(rows) {
  const seen = new Map();
  for (const row of rows) {
    if (!seen.has(row.track_id)) seen.set(row.track_id, row);
  }
  return [...seen.values()];
}

function pickRandomTracks(pool, n) {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

function genreLabel(id) {
  return GENRES.find((g) => g.id === id)?.label ?? id;
}

function buildExplanation(track) {
  const features = [
    { key: 'danceability', value: track.danceability },
    { key: 'energy', value: track.energy },
    { key: 'valence', value: track.valence },
    { key: 'acousticness', value: track.acousticness },
    { key: 'speechiness', value: track.speechiness },
  ].sort((a, b) => b.value - a.value);

  const top = features.slice(0, 2).map((f) => FEATURE_LABELS[f.key]);
  const genre = genreLabel(track.playlist_genre);
  const highPhrase = top.join(' and ');

  const genreHints = {
    edm: 'common in EDM and dance-pop',
    pop: 'common in EDM and pop',
    rap: 'common in rap and hip-hop',
    rock: 'common in rock',
    latin: 'common in latin playlists',
    'r&b': 'common in R&B',
  };

  return `This track has high ${highPhrase}, which is ${genreHints[track.playlist_genre] ?? `typical of ${genre}`}.`;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function featureRatio(track, key) {
  if (key === 'tempo') {
    return clamp01((track.tempo - 60) / 140);
  }

  return clamp01(track[key]);
}

function featureDisplayValue(track, feature) {
  const value = track[feature.key];
  if (feature.format) return feature.format(value);
  return `${Math.round(value * 100)}%`;
}

function topFingerprintFeatures(track) {
  return FINGERPRINT_FEATURES
    .filter((feature) => feature.key !== 'tempo')
    .map((feature) => ({
      ...feature,
      value: track[feature.key],
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 2);
}

function featureByKey(key) {
  return EXPLORER_FEATURES.find((feature) => feature.key === key);
}

function formatExploreValue(key, value) {
  const feature = featureByKey(key);
  if (feature?.format) return feature.format(value);
  return `${Math.round(value * 100)}%`;
}

function buildGenreStats(pool) {
  return d3
    .groups(pool, (track) => track.playlist_genre)
    .map(([genre, rows]) => {
      const means = Object.fromEntries(
        EXPLORER_FEATURES.map((feature) => [
          feature.key,
          d3.mean(rows, (row) => row[feature.key]),
        ]),
      );
      const example = [...rows].sort(
        (a, b) => b.track_popularity - a.track_popularity,
      )[0];

      return {
        genre,
        label: genreLabel(genre),
        count: rows.length,
        means,
        example,
      };
    })
    .sort((a, b) => d3.ascending(a.label, b.label));
}

function updateFingerprint(track, answered) {
  const card = document.getElementById('feature-fingerprint');
  const title = document.getElementById('feature-fingerprint-title');
  const status = document.getElementById('feature-card-status');
  const bars = document.getElementById('feature-bars');
  const summary = document.getElementById('feature-summary');
  if (!card || !title || !status || !bars || !summary) return;

  const genre = genreLabel(track.playlist_genre);
  card.dataset.genre = answered ? track.playlist_genre : 'mystery';
  title.textContent = answered ? `${genre} profile` : 'Mystery profile';
  status.textContent = answered
    ? `Revealed as ${genre}`
    : 'Track title and artist hidden';

  bars.replaceChildren();
  for (const feature of FINGERPRINT_FEATURES) {
    const row = document.createElement('div');
    row.className = 'feature-bar';

    const label = document.createElement('span');
    label.className = 'feature-bar__label';
    label.textContent = feature.label;

    const meter = document.createElement('span');
    meter.className = 'feature-bar__meter';
    meter.style.setProperty('--value', `${featureRatio(track, feature.key) * 100}%`);

    const value = document.createElement('span');
    value.className = 'feature-bar__value';
    value.textContent = featureDisplayValue(track, feature);

    row.append(label, meter, value);
    bars.append(row);
  }

  const top = topFingerprintFeatures(track).map((feature) => feature.label.toLowerCase());
  summary.textContent = answered
    ? buildExplanation(track)
    : `Strongest signals: ${top.join(' and ')}.`;
}

function spotifyUri(trackId) {
  return `spotify:track:${trackId}`;
}

function createSpotifyMask() {
  const mask = document.createElement('div');
  mask.className = 'spotify-embed__mask';
  mask.setAttribute('aria-hidden', 'true');
  return mask;
}

function updateSpotifyPlayButton() {
  const btn = document.getElementById('spotify-play-btn');
  if (!btn) return;

  btn.disabled = !spotifyIsReady;
  btn.classList.toggle('is-playing', !spotifyIsPaused);
  btn.setAttribute('aria-label', spotifyIsPaused ? 'Play preview' : 'Pause preview');
}

function loadSpotifyIframeApi() {
  if (spotifyApiPromise) return spotifyApiPromise;

  spotifyApiPromise = new Promise((resolve) => {
    if (window.SpotifyIframeApi) {
      resolve(window.SpotifyIframeApi);
      return;
    }

    window.onSpotifyIframeApiReady = (IFrameAPI) => {
      window.SpotifyIframeApi = IFrameAPI;
      resolve(IFrameAPI);
    };

    const existingScript = document.querySelector('script[data-spotify-iframe-api]');
    if (existingScript) return;

    const script = document.createElement('script');
    script.src = 'https://open.spotify.com/embed/iframe-api/v1';
    script.async = true;
    script.dataset.spotifyIframeApi = 'true';
    document.body.appendChild(script);
  });

  return spotifyApiPromise;
}

async function setSpotifyEmbed(trackId) {
  const container = document.getElementById('spotify-embed');
  if (!container || !trackId || container.dataset.trackId === trackId) return;

  container.dataset.trackId = trackId;
  spotifyIsReady = false;
  spotifyIsPaused = true;
  updateSpotifyPlayButton();

  if (spotifyController) {
    spotifyController.loadUri(spotifyUri(trackId));
    spotifyIsReady = true;
    updateSpotifyPlayButton();
    return;
  }

  container.replaceChildren();

  const embedMount = document.createElement('div');
  embedMount.className = 'spotify-embed__frame';
  container.append(embedMount, createSpotifyMask());

  const IFrameAPI = await loadSpotifyIframeApi();
  IFrameAPI.createController(
    embedMount,
    {
      width: '100%',
      height: 80,
      uri: spotifyUri(trackId),
    },
    (EmbedController) => {
      spotifyController = EmbedController;
      spotifyIsReady = true;
      updateSpotifyPlayButton();

      EmbedController.addListener('playback_update', (event) => {
        const { duration, isPaused, position } = event.data;
        const reachedEnd = duration > 0 && position >= duration - 250;
        spotifyIsPaused = isPaused || reachedEnd;
        updateSpotifyPlayButton();
      });
    },
  );
}

function setSpotifyConcealed(isConcealed) {
  const container = document.getElementById('spotify-embed');
  if (!container) return;

  container.classList.toggle('is-concealed', isConcealed);
  container.setAttribute(
    'aria-label',
    isConcealed
      ? 'Spotify track preview with title and artist hidden until a genre is selected'
      : 'Spotify track preview',
  );
}

function updatePanel(tracks, state) {
  const i = state.activeIndex;
  const track = tracks[i];
  const answered = state.answers[i];

  setSpotifyEmbed(track.track_id);
  setSpotifyConcealed(!answered);
  updateFingerprint(track, answered);

  document.getElementById('now-playing-title').textContent = `Song ${i + 1}`;
  document.getElementById('progress-text').textContent = `Track ${i + 1} of ${tracks.length}`;

  const controls = document.getElementById('guess-controls');
  const reveal = document.getElementById('guess-reveal');
  const nextBtn = document.getElementById('btn-next-track');

  if (!answered) {
    controls.hidden = false;
    reveal.hidden = true;
    document.querySelectorAll('.genre-btn').forEach((btn) => {
      btn.disabled = false;
    });
    return;
  }

  controls.hidden = true;
  reveal.hidden = false;

  const resultEl = document.getElementById('reveal-result');
  resultEl.textContent = answered.correct ? 'Correct!' : 'Not quite.';
  resultEl.className = `reveal-result ${answered.correct ? 'is-correct' : 'is-wrong'}`;

  document.getElementById('reveal-track-name').textContent = track.track_name;
  document.getElementById('reveal-artist').textContent = track.track_artist;
  document.getElementById('reveal-genre').textContent = genreLabel(track.playlist_genre);
  document.getElementById('reveal-explanation').textContent = buildExplanation(track);

  const allDone = state.answers.every(Boolean);
  nextBtn.hidden = allDone;
  nextBtn.textContent = i < tracks.length - 1 ? 'Next song' : 'Finish';
}

function summarizeResults(tracks, state) {
  const correctCount = state.answers.filter((answer) => answer?.correct).length;
  const missed = state.answers
    .map((answer, index) => ({ answer, track: tracks[index] }))
    .filter(({ answer }) => !answer.correct);
  const mostCommonMiss = d3.rollups(
    missed,
    (items) => items.length,
    ({ track }) => track.playlist_genre,
  ).sort((a, b) => b[1] - a[1])[0];

  const summary = document.getElementById('game-summary');
  const lede = document.getElementById('game-summary-lede');
  const stats = document.getElementById('game-summary-stats');
  const list = document.getElementById('game-summary-list');
  if (!summary || !lede || !stats || !list) return;

  const percent = Math.round((correctCount / tracks.length) * 100);
  lede.textContent =
    correctCount === tracks.length
      ? `Perfect run: ${correctCount} out of ${tracks.length}. You caught every genre.`
      : `You guessed ${correctCount} out of ${tracks.length} correctly (${percent}%). ${
          mostCommonMiss
            ? `${genreLabel(mostCommonMiss[0])} was the trickiest genre in this set.`
            : 'The misses were spread across the set.'
        }`;

  stats.replaceChildren();
  [
    { label: 'Correct', value: `${correctCount}/${tracks.length}` },
    { label: 'Accuracy', value: `${percent}%` },
    { label: 'Missed', value: `${tracks.length - correctCount}` },
  ].forEach((item) => {
    const stat = document.createElement('div');
    stat.className = 'game-summary__stat';
    stat.innerHTML = `<span>${item.label}</span><strong>${item.value}</strong>`;
    stats.append(stat);
  });

  list.replaceChildren();
  tracks.forEach((track, index) => {
    const answer = state.answers[index];
    const item = document.createElement('article');
    item.className = `game-summary__item ${answer.correct ? 'is-correct' : 'is-wrong'}`;
    item.innerHTML = `
      <span class="game-summary__badge">${answer.correct ? 'Correct' : 'Missed'}</span>
      <div>
        <h3>Song ${index + 1}: ${track.track_name}</h3>
        <p>${track.track_artist}</p>
      </div>
      <dl>
        <div>
          <dt>Your guess</dt>
          <dd>${genreLabel(answer.guessed)}</dd>
        </div>
        <div>
          <dt>Genre</dt>
          <dd>${genreLabel(track.playlist_genre)}</dd>
        </div>
      </dl>
    `;
    list.append(item);
  });

  summary.hidden = false;
}

function maybeShowFinalSummary(tracks, state) {
  if (!state.answers.every(Boolean)) return;

  summarizeResults(tracks, state);
  requestAnimationFrame(() => {
    document.getElementById('game-summary')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  });
}

function renderGenreExplorerProfile(stats, selectedGenre) {
  const profile = document.getElementById('genre-profile');
  const title = document.getElementById('genre-profile-title');
  const meta = document.getElementById('genre-profile-meta');
  const bars = document.getElementById('genre-profile-bars');
  const note = document.getElementById('genre-profile-note');
  const selected = stats.find((item) => item.genre === selectedGenre) ?? stats[0];
  if (!profile || !title || !meta || !bars || !note || !selected) return;

  profile.dataset.genre = selected.genre;
  title.textContent = selected.label;
  meta.textContent = `${selected.count.toLocaleString()} tracks in this dataset`;
  bars.replaceChildren();

  EXPLORER_FEATURES.forEach((feature) => {
    const row = document.createElement('div');
    row.className = 'genre-profile__bar';
    const value = selected.means[feature.key];
    row.innerHTML = `
      <span>${feature.label}</span>
      <i style="--value: ${featureRatio(selected.means, feature.key) * 100}%"></i>
      <strong>${formatExploreValue(feature.key, value)}</strong>
    `;
    bars.append(row);
  });

  note.textContent = selected.example
    ? `A popular ${selected.label} example here is "${selected.example.track_name}" by ${selected.example.track_artist}.`
    : '';
}

function initGenreExplorer(pool) {
  const stats = buildGenreStats(pool);
  const tabs = document.getElementById('explorer-feature-tabs');
  const svgEl = document.getElementById('explorer-chart');
  const tooltip = document.getElementById('explorer-tooltip');
  if (!tabs || !svgEl || !stats.length) return;

  const state = {
    feature: 'energy',
    selectedGenre: stats.find((item) => item.genre === 'edm')?.genre ?? stats[0].genre,
  };

  tabs.replaceChildren();
  EXPLORER_FEATURES.forEach((feature) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'explorer-tab';
    btn.textContent = feature.label;
    btn.setAttribute('role', 'tab');
    btn.dataset.feature = feature.key;
    btn.addEventListener('click', () => {
      state.feature = feature.key;
      render();
    });
    tabs.append(btn);
  });

  const svg = d3.select(svgEl);
  const margin = { top: 12, right: 96, bottom: 28, left: 82 };

  function render() {
    const bounds = svgEl.getBoundingClientRect();
    const width = Math.max(320, Math.floor(bounds.width || 640));
    const height = 320;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const ranked = [...stats].sort(
      (a, b) => d3.descending(a.means[state.feature], b.means[state.feature]),
    );
    const maxValue =
      state.feature === 'tempo'
        ? d3.max(ranked, (item) => item.means[state.feature]) * 1.08
        : 1;
    const x = d3.scaleLinear().domain([0, maxValue]).range([0, innerWidth]);
    const y = d3
      .scaleBand()
      .domain(ranked.map((item) => item.genre))
      .range([0, innerHeight])
      .padding(0.24);

    svg.attr('viewBox', `0 0 ${width} ${height}`);

    tabs.querySelectorAll('.explorer-tab').forEach((btn) => {
      const active = btn.dataset.feature === state.feature;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });

    const root = svg.selectAll('g.explorer-root').data([null]).join('g')
      .attr('class', 'explorer-root')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    root.selectAll('g.x-axis').data([null]).join('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .transition()
      .duration(350)
      .call(
        d3
          .axisBottom(x)
          .ticks(4)
          .tickSizeOuter(0)
          .tickFormat((value) =>
            state.feature === 'tempo' ? Math.round(value) : `${Math.round(value * 100)}%`,
          ),
      );

    root.selectAll('g.y-axis').data([null]).join('g')
      .attr('class', 'y-axis')
      .transition()
      .duration(350)
      .call(d3.axisLeft(y).tickFormat((genre) => genreLabel(genre)).tickSize(0));

    const rows = root.selectAll('g.explorer-row')
      .data(ranked, (item) => item.genre)
      .join((enter) => {
        const row = enter.append('g').attr('class', 'explorer-row');
        row.append('rect').attr('rx', 7).attr('height', y.bandwidth()).attr('width', 0);
        row.append('text').attr('class', 'explorer-value').attr('dy', '0.35em');
        return row;
      });

    rows
      .classed('is-selected', (item) => item.genre === state.selectedGenre)
      .style('cursor', 'pointer')
      .on('click', (_, item) => {
        state.selectedGenre = item.genre;
        render();
      })
      .on('pointerenter', (event, item) => {
        if (!tooltip) return;
        tooltip.hidden = false;
        tooltip.innerHTML = `
          <strong>${item.label}</strong>
          <span>${formatExploreValue(state.feature, item.means[state.feature])}</span>
          <small>${item.count.toLocaleString()} tracks</small>
        `;
      })
      .on('pointermove', (event) => {
        if (!tooltip) return;
        const wrap = event.currentTarget.ownerSVGElement.getBoundingClientRect();
        tooltip.style.left = `${event.clientX - wrap.left + 12}px`;
        tooltip.style.top = `${event.clientY - wrap.top - 12}px`;
      })
      .on('pointerleave', () => {
        if (tooltip) tooltip.hidden = true;
      });

    rows.transition()
      .duration(450)
      .attr('transform', (item) => `translate(0,${y(item.genre)})`);

    rows.select('rect')
      .transition()
      .duration(450)
      .attr('width', (item) => x(item.means[state.feature]))
      .attr('height', y.bandwidth())
      .attr('fill', (item) => GENRE_COLORS[item.genre]);

    rows.select('text.explorer-value')
      .transition()
      .duration(450)
      .attr('x', innerWidth + 10)
      .attr('y', y.bandwidth() / 2)
      .text((item) => formatExploreValue(state.feature, item.means[state.feature]));

    renderGenreExplorerProfile(stats, state.selectedGenre);
  }

  render();

  const resizeObserver = new ResizeObserver(render);
  resizeObserver.observe(svgEl);
}

function setRandomTrackEmbed(track) {
  const embed = document.getElementById('random-track-embed');
  const title = document.getElementById('random-track-title');
  if (!embed || !title || !track) return;

  title.textContent = `${track.track_name} - ${track.track_artist} (${genreLabel(track.playlist_genre)})`;
  embed.replaceChildren();

  const iframe = document.createElement('iframe');
  iframe.src = `https://open.spotify.com/embed/track/${encodeURIComponent(track.track_id)}`;
  iframe.width = '100%';
  iframe.height = '80';
  iframe.setAttribute('frameborder', '0');
  iframe.allow =
    'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
  iframe.loading = 'lazy';
  iframe.title = `Spotify preview for ${track.track_name}`;
  embed.appendChild(iframe);
}

function initRandomTrackPlayer(pool) {
  const btn = document.getElementById('btn-random-track');
  const candidates = pool.filter((track) => track.track_id);
  if (!btn || !candidates.length) return;

  let currentTrackId = null;

  function pickTrack() {
    let next = candidates[Math.floor(Math.random() * candidates.length)];
    if (candidates.length > 1) {
      while (next.track_id === currentTrackId) {
        next = candidates[Math.floor(Math.random() * candidates.length)];
      }
    }
    currentTrackId = next.track_id;
    setRandomTrackEmbed(next);
  }

  btn.addEventListener('click', pickTrack);
  pickTrack();
}

function onGuess(tracks, state, guessedGenre) {
  const i = state.activeIndex;
  if (state.answers[i]) return;

  const actual = tracks[i].playlist_genre;
  const correct = guessedGenre === actual;

  state.answers[i] = { guessed: guessedGenre, correct };

  updatePanel(tracks, state);
  maybeShowFinalSummary(tracks, state);
}

function onNextTrack(tracks, state) {
  const i = state.activeIndex;
  if (!state.answers[i]) return;

  if (i < tracks.length - 1) {
    state.activeIndex = i + 1;
    updatePanel(tracks, state);
  }
}

function wireGenreButtons(tracks, state) {
  document.querySelectorAll('.genre-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      onGuess(tracks, state, btn.dataset.genre);
    });
  });
}

function wireSpotifyPlayButton() {
  const btn = document.getElementById('spotify-play-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (!spotifyController || !spotifyIsReady) return;

    spotifyController.togglePlay();
  });
}

async function init() {
  const raw = await d3.csv(DATA_URL, parseRow);
  const pool = dedupeByTrackId(raw).filter((d) =>
    GENRES.some((g) => g.id === d.playlist_genre),
  );
  const tracks = pickRandomTracks(pool, TRACK_COUNT);

  const state = {
    activeIndex: 0,
    answers: Array(TRACK_COUNT).fill(null),
  };

  wireGenreButtons(tracks, state);
  wireSpotifyPlayButton();
  initGenreExplorer(pool);
  initRandomTrackPlayer(pool);

  document.getElementById('btn-next-track').addEventListener('click', () => {
    onNextTrack(tracks, state);
  });

  updatePanel(tracks, state);
}

init().catch((err) => {
  console.error(err);
  document.querySelector('.genre-guess').insertAdjacentHTML(
    'beforeend',
    '<p class="section-note">Could not load data. Serve this folder with a local server (e.g. python3 -m http.server).</p>',
  );
});
