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

const POPULARITY_FEATURES = [
  { key: 'duration_min', label: 'Duration', format: (value) => `${value.toFixed(1)} min` },
  { key: 'danceability', label: 'Danceability' },
  { key: 'energy', label: 'Energy' },
  { key: 'valence', label: 'Mood' },
  { key: 'acousticness', label: 'Acousticness' },
  { key: 'speechiness', label: 'Speechiness' },
  { key: 'loudness', label: 'Loudness', format: (value) => `${value.toFixed(1)} dB` },
  { key: 'tempo', label: 'Tempo', format: (value) => `${Math.round(value)} BPM` },
];

let spotifyApiPromise = null;
let spotifyController = null;
let spotifyIsPaused = true;
let spotifyIsReady = false;

function parseNumber(value) {
  return value === '' || value == null ? NaN : +value;
}

function parseRow(row) {
  return {
    track_id: row.track_id?.trim(),
    track_name: row.track_name?.trim(),
    track_artist: row.track_artist?.trim(),
    track_popularity: parseNumber(row.track_popularity),
    duration_ms: parseNumber(row.duration_ms),
    playlist_genre: row.playlist_genre,
    danceability: parseNumber(row.danceability),
    energy: parseNumber(row.energy),
    valence: parseNumber(row.valence),
    acousticness: parseNumber(row.acousticness),
    speechiness: parseNumber(row.speechiness),
    instrumentalness: parseNumber(row.instrumentalness),
    liveness: parseNumber(row.liveness),
    loudness: parseNumber(row.loudness),
    tempo: parseNumber(row.tempo),
  };
}

function hasRequiredTrackData(row) {
  return Boolean(
    row.track_name &&
    row.track_artist &&
    row.track_id &&
    row.playlist_genre &&
    Number.isFinite(row.track_popularity) &&
    Number.isFinite(row.duration_ms) &&
    Number.isFinite(row.danceability) &&
    Number.isFinite(row.energy) &&
    Number.isFinite(row.valence) &&
    Number.isFinite(row.acousticness) &&
    Number.isFinite(row.speechiness) &&
    Number.isFinite(row.instrumentalness) &&
    Number.isFinite(row.liveness) &&
    Number.isFinite(row.loudness) &&
    Number.isFinite(row.tempo),
  );
}

function dedupeByTrackName(rows) {
  const bestByName = new Map();
  const sortedRows = [...rows].sort((a, b) =>
    d3.ascending(a.track_name, b.track_name) ||
    d3.descending(a.track_popularity, b.track_popularity),
  );

  for (const row of sortedRows) {
    if (!bestByName.has(row.track_name)) bestByName.set(row.track_name, row);
  }
  return [...bestByName.values()];
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

function performanceValue(track, key) {
  if (key === 'duration_min') return track.duration_ms / 60000;
  return track[key];
}

function performanceFeature(key) {
  return POPULARITY_FEATURES.find((feature) => feature.key === key);
}

function formatPerformanceValue(key, value) {
  const feature = performanceFeature(key);
  if (feature?.format) return feature.format(value);
  return `${Math.round(value * 100)}%`;
}

function makeScatterSample(pool) {
  return d3
    .groups(pool, (track) => track.playlist_genre)
    .flatMap(([, rows]) => d3.shuffle([...rows]).slice(0, 280));
}

function buildArtistStats(pool) {
  return d3
    .groups(pool, (track) => track.track_artist)
    .map(([artist, rows]) => ({
      artist,
      count: rows.length,
      avgPopularity: d3.mean(rows, (track) => track.track_popularity),
      topTrack: [...rows].sort((a, b) => b.track_popularity - a.track_popularity)[0],
    }))
    .filter((artist) => artist.count >= 5 && Number.isFinite(artist.avgPopularity))
    .sort((a, b) => d3.descending(a.avgPopularity, b.avgPopularity))
    .slice(0, 12);
}

function setPerformanceNote(view, featureKey, data) {
  const title = document.getElementById('performance-note-title');
  const copy = document.getElementById('performance-note-copy');
  const stats = document.getElementById('performance-note-stats');
  if (!title || !copy || !stats) return;

  stats.replaceChildren();

  function addStat(item) {
    const stat = document.createElement('div');
    stat.innerHTML = `<span>${item.label}</span><strong>${item.value}</strong>`;
    stats.append(stat);
  }

  if (view === 'duration') {
    const avgDuration = d3.mean(data, (track) => performanceValue(track, 'duration_min'));
    const avgPopularity = d3.mean(data, (track) => track.track_popularity);
    title.textContent = 'Are shorter songs more popular?';
    copy.textContent =
      'Each point is a track. The x-axis shows song length, while the y-axis shows Spotify popularity. Look for clusters rather than one perfect trend.';
    [
      { label: 'Avg duration', value: `${avgDuration.toFixed(1)} min` },
      { label: 'Avg popularity', value: Math.round(avgPopularity) },
    ].forEach(addStat);
    return;
  }

  if (view === 'audio') {
    const feature = performanceFeature(featureKey);
    const values = data.map((track) => performanceValue(track, featureKey));
    title.textContent = `Does ${feature.label.toLowerCase()} relate to popularity?`;
    copy.textContent =
      'Switch traits to see whether popular songs cluster around higher or lower audio-feature values. Color keeps genre visible while the x-axis changes.';
    [
      { label: 'Selected trait', value: feature.label },
      { label: 'Median value', value: formatPerformanceValue(featureKey, d3.median(values)) },
    ].forEach(addStat);
    return;
  }

  title.textContent = 'Which artists are consistently popular?';
  copy.textContent =
    'This view ranks artists with at least five tracks in the dataset by average popularity, so one hit song does not dominate the story.';
  [
    { label: 'Artists shown', value: data.length },
    { label: 'Minimum tracks', value: '5' },
  ].forEach(addStat);
}

function initPerformanceExplorer(pool) {
  const svgEl = document.getElementById('performance-chart');
  const steps = document.getElementById('performance-steps');
  const featureTabs = document.getElementById('performance-feature-tabs');
  const genreFilters = document.getElementById('performance-genre-filters');
  const tooltip = document.getElementById('performance-tooltip');
  if (!svgEl || !steps || !featureTabs || !genreFilters) return;

  const scatterData = makeScatterSample(pool).filter((track) =>
    Number.isFinite(track.track_popularity) &&
    Number.isFinite(track.duration_ms),
  );
  const artistData = buildArtistStats(pool);
  const state = {
    view: 'duration',
    feature: 'duration_min',
    genres: new Set(GENRES.map((genre) => genre.id)),
  };

  POPULARITY_FEATURES.filter((feature) => feature.key !== 'duration_min').forEach((feature) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'performance-feature-tab';
    btn.textContent = feature.label;
    btn.setAttribute('role', 'tab');
    btn.dataset.feature = feature.key;
    btn.addEventListener('click', () => {
      state.feature = feature.key;
      render();
    });
    featureTabs.append(btn);
  });

  GENRES.forEach((genre) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'performance-genre-filter';
    btn.textContent = genre.label;
    btn.dataset.genre = genre.id;
    btn.addEventListener('click', () => {
      if (state.genres.has(genre.id) && state.genres.size > 1) {
        state.genres.delete(genre.id);
      } else {
        state.genres.add(genre.id);
      }
      render();
    });
    genreFilters.append(btn);
  });

  steps.querySelectorAll('.performance-step').forEach((btn) => {
    btn.setAttribute('role', 'tab');
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      if (state.view === 'duration') state.feature = 'duration_min';
      if (state.view === 'audio' && state.feature === 'duration_min') {
        state.feature = 'danceability';
      }
      render();
    });
  });

  const svg = d3.select(svgEl);
  const margin = { top: 18, right: 24, bottom: 48, left: 54 };

  function renderScatter() {
    const bounds = svgEl.getBoundingClientRect();
    const width = Math.max(340, Math.floor(bounds.width || 720));
    const height = 390;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const data = scatterData.filter((track) =>
      state.genres.has(track.playlist_genre) &&
      Number.isFinite(performanceValue(track, state.feature)) &&
      Number.isFinite(track.track_popularity),
    );
    const xValues = data.map((track) => performanceValue(track, state.feature));
    const sortedX = [...xValues].sort(d3.ascending);
    const xDomain =
      state.feature === 'duration_min'
        ? [1, Math.min(8, d3.quantile(sortedX, 0.98) ?? 8)]
        : state.feature === 'loudness' || state.feature === 'tempo'
          ? d3.extent(xValues)
          : [0, 1];

    const x = d3.scaleLinear().domain(xDomain).nice().range([0, innerWidth]);
    const y = d3.scaleLinear().domain([0, 100]).range([innerHeight, 0]);

    svg.attr('viewBox', `0 0 ${width} ${height}`);
    const root = svg.selectAll('g.performance-root').data([null]).join('g')
      .attr('class', 'performance-root')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    root.selectAll('*').remove();

    root.append('g')
      .attr('class', 'performance-grid')
      .call(d3.axisLeft(y).ticks(5).tickSize(-innerWidth).tickFormat(''));

    root.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(
        d3.axisBottom(x).ticks(5).tickFormat((value) =>
          state.feature === 'duration_min'
            ? `${value}m`
            : state.feature === 'tempo'
              ? Math.round(value)
              : state.feature === 'loudness'
                ? value
                : `${Math.round(value * 100)}%`,
        ),
      );

    root.append('g').attr('class', 'y-axis').call(d3.axisLeft(y).ticks(5));

    root.append('text')
      .attr('class', 'axis-label')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 40)
      .attr('text-anchor', 'middle')
      .text(performanceFeature(state.feature).label);

    root.append('text')
      .attr('class', 'axis-label')
      .attr('x', -innerHeight / 2)
      .attr('y', -40)
      .attr('text-anchor', 'middle')
      .attr('transform', 'rotate(-90)')
      .text('Popularity');

    root.selectAll('circle')
      .data(data, (track) => track.track_id)
      .join('circle')
      .attr('cx', (track) => x(performanceValue(track, state.feature)))
      .attr('cy', (track) => y(track.track_popularity))
      .attr('r', 4)
      .attr('fill', (track) => GENRE_COLORS[track.playlist_genre])
      .attr('opacity', 0.58)
      .on('pointerenter', (event, track) => {
        if (!tooltip) return;
        tooltip.hidden = false;
        tooltip.innerHTML = `
          <strong>${track.track_name}</strong>
          <span>${track.track_artist}</span>
          <small>${genreLabel(track.playlist_genre)} · popularity ${track.track_popularity}</small>
          <small>${performanceFeature(state.feature).label}: ${formatPerformanceValue(state.feature, performanceValue(track, state.feature))}</small>
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

    setPerformanceNote(state.view, state.feature, data);
  }

  function renderArtists() {
    const bounds = svgEl.getBoundingClientRect();
    const width = Math.max(340, Math.floor(bounds.width || 720));
    const height = 420;
    const artistMargin = { top: 16, right: 70, bottom: 28, left: 150 };
    const innerWidth = width - artistMargin.left - artistMargin.right;
    const innerHeight = height - artistMargin.top - artistMargin.bottom;
    const x = d3.scaleLinear()
      .domain([0, d3.max(artistData, (artist) => artist.avgPopularity) * 1.08])
      .range([0, innerWidth]);
    const y = d3.scaleBand()
      .domain(artistData.map((artist) => artist.artist))
      .range([0, innerHeight])
      .padding(0.24);

    svg.attr('viewBox', `0 0 ${width} ${height}`);
    const root = svg.selectAll('g.performance-root').data([null]).join('g')
      .attr('class', 'performance-root')
      .attr('transform', `translate(${artistMargin.left},${artistMargin.top})`);

    root.selectAll('*').remove();
    root.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).ticks(5));
    root.append('g').attr('class', 'y-axis').call(d3.axisLeft(y).tickSize(0));

    const rows = root.selectAll('g.artist-row')
      .data(artistData, (artist) => artist.artist)
      .join('g')
      .attr('class', 'artist-row')
      .attr('transform', (artist) => `translate(0,${y(artist.artist)})`);

    rows.append('rect')
      .attr('height', y.bandwidth())
      .attr('rx', 7)
      .attr('width', (artist) => x(artist.avgPopularity))
      .attr('fill', 'var(--accent)');

    rows.append('text')
      .attr('class', 'artist-value')
      .attr('x', (artist) => x(artist.avgPopularity) + 8)
      .attr('y', y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .text((artist) => `${Math.round(artist.avgPopularity)} · ${artist.count} tracks`);

    rows
      .on('pointerenter', (event, artist) => {
        if (!tooltip) return;
        tooltip.hidden = false;
        tooltip.innerHTML = `
          <strong>${artist.artist}</strong>
          <span>Avg popularity ${Math.round(artist.avgPopularity)}</span>
          <small>${artist.count} tracks · top track: ${artist.topTrack.track_name}</small>
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

    setPerformanceNote('artists', state.feature, artistData);
  }

  function render() {
    steps.querySelectorAll('.performance-step').forEach((btn) => {
      const active = btn.dataset.view === state.view;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });

    featureTabs.hidden = state.view !== 'audio';
    genreFilters.hidden = state.view === 'artists';

    featureTabs.querySelectorAll('.performance-feature-tab').forEach((btn) => {
      const active = btn.dataset.feature === state.feature;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });

    genreFilters.querySelectorAll('.performance-genre-filter').forEach((btn) => {
      const genre = btn.dataset.genre;
      btn.classList.toggle('is-active', state.genres.has(genre));
      btn.style.setProperty('--filter-color', GENRE_COLORS[genre]);
    });

    if (tooltip) tooltip.hidden = true;
    if (state.view === 'artists') renderArtists();
    else renderScatter();
  }

  render();

  const resizeObserver = new ResizeObserver(render);
  resizeObserver.observe(svgEl);
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
  const pool = dedupeByTrackName(raw)
    .filter(hasRequiredTrackData)
    .filter((d) => GENRES.some((g) => g.id === d.playlist_genre));
  const tracks = pickRandomTracks(pool, TRACK_COUNT);

  const state = {
    activeIndex: 0,
    answers: Array(TRACK_COUNT).fill(null),
  };

  wireGenreButtons(tracks, state);
  wireSpotifyPlayButton();
  initGenreExplorer(pool);
  initRandomTrackPlayer(pool);
  initPerformanceExplorer(pool);

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
