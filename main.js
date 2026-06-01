import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

const DATA_URL = 'data/spotify_songs.csv';
const TRACK_COUNT = 5;

/** Re-sync sticky chapter UI (e.g. after game completes on chapter 0) */
let refreshStoryChapter = () => {};

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

const JOURNEY_ARTISTS = [
  { id: 'Justin Bieber', label: 'Justin Bieber', genre: 'pop' },
  { id: 'Selena Gomez', label: 'Selena Gomez', genre: 'pop' },
  { id: 'Beyoncé', label: 'Beyoncé', genre: 'r&b' },
  { id: 'Frank Ocean', label: 'Frank Ocean', genre: 'r&b' },
  { id: 'Future', label: 'Future', genre: 'rap' },
];

const JOURNEY_OVERLAY_FEATURES = [
  { key: 'danceability', label: 'Danceability' },
  { key: 'energy', label: 'Energy' },
  { key: 'valence', label: 'Mood' },
  { key: 'acousticness', label: 'Acousticness' },
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
    track_album_release_date: row.track_album_release_date?.trim() ?? '',
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
  const playAgain = document.getElementById('btn-play-again');
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
  if (playAgain) playAgain.hidden = false;
  document.getElementById('genre-guess')?.classList.add('is-complete');
  refreshStoryChapter();
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

function buildArtistJourneyData(pool, artistId) {
  const tracks = pool.filter(
    (t) => t.track_artist === artistId && t.track_album_release_date,
  );
  return d3
    .groups(tracks, (t) => +t.track_album_release_date.slice(0, 4))
    .map(([year, rows]) => ({
      year,
      avgPopularity: d3.mean(rows, (t) => t.track_popularity),
      featureAvgs: {
        danceability: d3.mean(rows, (t) => t.danceability),
        energy: d3.mean(rows, (t) => t.energy),
        valence: d3.mean(rows, (t) => t.valence),
        acousticness: d3.mean(rows, (t) => t.acousticness),
      },
      topTrack: [...rows].sort((a, b) => b.track_popularity - a.track_popularity)[0],
      count: rows.length,
    }))
    .filter((d) => Number.isFinite(d.avgPopularity) && d.year > 1900)
    .sort((a, b) => a.year - b.year);
}

function buildGenreJourneyData(pool) {
  const result = {};
  GENRES.forEach(({ id }) => {
    const tracks = pool.filter(
      (t) => t.playlist_genre === id && t.track_album_release_date,
    );
    result[id] = d3
      .groups(tracks, (t) => +t.track_album_release_date.slice(0, 4))
      .map(([year, rows]) => ({
        year,
        avgPopularity: d3.mean(rows, (t) => t.track_popularity),
        featureAvgs: {
          danceability: d3.mean(rows, (t) => t.danceability),
          energy: d3.mean(rows, (t) => t.energy),
          valence: d3.mean(rows, (t) => t.valence),
          acousticness: d3.mean(rows, (t) => t.acousticness),
        },
        count: rows.length,
      }))
      .filter((d) => Number.isFinite(d.avgPopularity) && d.year >= 1990 && d.year <= 2020)
      .sort((a, b) => a.year - b.year);
  });
  return result;
}

function pearsonR(xs, ys) {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = d3.mean(xs);
  const my = d3.mean(ys);
  const num = d3.sum(xs.map((x, i) => (x - mx) * (ys[i] - my)));
  const den = Math.sqrt(
    d3.sum(xs.map((x) => (x - mx) ** 2)) * d3.sum(ys.map((y) => (y - my) ** 2)),
  );
  return den === 0 ? 0 : num / den;
}

function findMostCorrelatedFeature(data) {
  let best = { key: 'danceability', label: 'Danceability', r: 0 };
  for (const feat of JOURNEY_OVERLAY_FEATURES) {
    const pairs = data.filter((d) => Number.isFinite(d.featureAvgs[feat.key]));
    if (pairs.length < 3) continue;
    const r = pearsonR(
      pairs.map((d) => d.avgPopularity),
      pairs.map((d) => d.featureAvgs[feat.key] * 100),
    );
    if (Math.abs(r) > Math.abs(best.r)) best = { ...feat, r };
  }
  return best;
}

function buildSoundNarrative(artistId, corr) {
  const label = corr.label.toLowerCase();
  const name = artistId.split(' ')[0];
  const pct = `${corr.r >= 0 ? '+' : ''}${Math.round(corr.r * 100)}%`;
  const rising = {
    danceability: 'more dance-floor ready',
    energy: 'more intense and high-energy',
    valence: 'more upbeat and positive',
    acousticness: 'more stripped-back and acoustic',
  };
  const falling = {
    danceability: 'less dance-driven',
    energy: 'more restrained',
    valence: 'more introspective',
    acousticness: 'more heavily produced',
  };
  if (corr.r > 0.3) {
    return `As ${name}'s streaming numbers climbed, so did their ${label} — their sound became ${rising[corr.key] ?? 'more pronounced'} over the years (r = ${pct}).`;
  }
  if (corr.r < -0.3) {
    return `Even as ${name} grew more popular, their ${label} dropped — they became ${falling[corr.key] ?? 'sonically different'} over time (r = ${pct}).`;
  }
  return `${name}'s ${label} stayed relatively stable throughout their career (r = ${pct}), suggesting their core sound held steady even as popularity shifted.`;
}

function journeyChartSetup(svgEl) {
  const bounds = svgEl.getBoundingClientRect();
  const width = Math.max(340, Math.floor(bounds.width || 640));
  const wrapH = svgEl.parentElement?.clientHeight ?? 0;
  const height = wrapH > 150 ? Math.floor(wrapH) : 300;
  const margin = { top: 20, right: 24, bottom: 44, left: 54 };
  const iW = width - margin.left - margin.right;
  const iH = height - margin.top - margin.bottom;
  d3.select(svgEl).attr('viewBox', `0 0 ${width} ${height}`);
  const root = d3.select(svgEl).selectAll('g.journey-root').data([null]).join('g')
    .attr('class', 'journey-root')
    .attr('transform', `translate(${margin.left},${margin.top})`);
  return { width, height, margin, iW, iH, root };
}

function journeyAxes(root, x, y, iW, iH, xTicks) {
  root.selectAll('.journey-grid').data([null]).join('g').attr('class', 'journey-grid')
    .call(d3.axisLeft(y).ticks(5).tickSize(-iW).tickFormat(''));
  root.selectAll('.x-axis').data([null]).join('g').attr('class', 'x-axis')
    .attr('transform', `translate(0,${iH})`)
    .call(d3.axisBottom(x).ticks(xTicks).tickFormat(d3.format('d')).tickSizeOuter(0));
  root.selectAll('.y-axis').data([null]).join('g').attr('class', 'y-axis')
    .call(d3.axisLeft(y).ticks(5).tickSizeOuter(0));
  root.selectAll('.axis-label').data([null]).join('text').attr('class', 'axis-label')
    .attr('x', -iH / 2).attr('y', -42).attr('text-anchor', 'middle')
    .attr('transform', 'rotate(-90)').text('Popularity (0–100)');
}

function attachDotTooltip(dots, tooltipEl, extraHtml) {
  dots
    .on('pointerenter', (event, d) => {
      if (!tooltipEl) return;
      tooltipEl.hidden = false;
      tooltipEl.innerHTML = extraHtml(d);
    })
    .on('pointermove', (event) => {
      if (!tooltipEl) return;
      const rect = event.currentTarget.ownerSVGElement.getBoundingClientRect();
      tooltipEl.style.left = `${event.clientX - rect.left + 12}px`;
      tooltipEl.style.top = `${event.clientY - rect.top - 12}px`;
    })
    .on('pointerleave', () => { if (tooltipEl) tooltipEl.hidden = true; });
}

function drawRevealChart(svgEl, data, state, tooltipEl) {
  if (!data.length) return;
  const displayData = data.slice(0, state.yearIndex + 1);
  const currentYear = displayData.at(-1)?.year;
  const color = GENRE_COLORS[state.genre] ?? '#c67b5c';
  const { iW, iH, root } = journeyChartSetup(svgEl);

  const x = d3.scaleLinear().domain(d3.extent(data, (d) => d.year)).range([0, iW]);
  const y = d3.scaleLinear().domain([0, 100]).range([iH, 0]);

  journeyAxes(root, x, y, iW, iH, Math.min(data.length, 8));

  const popLine = d3.line()
    .defined((d) => Number.isFinite(d.avgPopularity))
    .x((d) => x(d.year)).y((d) => y(d.avgPopularity))
    .curve(d3.curveMonotoneX);

  root.selectAll('path.journey-pop-path').data([displayData]).join('path')
    .attr('class', 'journey-pop-path')
    .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2.5)
    .attr('d', popLine);

  const dotsGroup = root.selectAll('g.journey-dots').data([null]).join('g')
    .attr('class', 'journey-dots');

  const dots = dotsGroup.selectAll('circle.journey-pop-dot')
    .data(displayData, (d) => d.year)
    .join(
      (enter) => enter.append('circle')
        .attr('class', 'journey-pop-dot')
        .attr('cx', (d) => x(d.year)).attr('cy', (d) => y(d.avgPopularity))
        .attr('r', 0).attr('fill', color)
        .attr('stroke', '#fffaf6').attr('stroke-width', 2).style('cursor', 'pointer'),
      (update) => update
        .attr('cx', (d) => x(d.year)).attr('cy', (d) => y(d.avgPopularity))
        .attr('r', (d) => (d.year === currentYear ? 7.5 : 5.5)).attr('fill', color),
    );

  dots.filter((d) => d.year === currentYear)
    .transition().duration(350).ease(d3.easeCubicOut).attr('r', 7.5);

  attachDotTooltip(dots, tooltipEl, (d) => `
    <strong>${d.year}</strong>
    <span>Avg popularity: ${Math.round(d.avgPopularity)}</span>
    <small>Top: "${d.topTrack?.track_name ?? '—'}"</small>
    <small>${d.count} track${d.count !== 1 ? 's' : ''} this year</small>
  `);
}

function drawSoundChart(svgEl, data, state, tooltipEl) {
  if (!data.length) return;
  const color = GENRE_COLORS[state.genre] ?? '#c67b5c';
  const { iW, iH, root } = journeyChartSetup(svgEl);
  root.selectAll('*').remove();

  const x = d3.scaleLinear().domain(d3.extent(data, (d) => d.year)).range([0, iW]);
  const y = d3.scaleLinear().domain([0, 100]).range([iH, 0]);

  journeyAxes(root, x, y, iW, iH, Math.min(data.length, 8));

  const featKey = state.soundFeature?.key;
  if (featKey) {
    const featLine = d3.line()
      .defined((d) => Number.isFinite(d.featureAvgs[featKey]))
      .x((d) => x(d.year)).y((d) => y(clamp01(d.featureAvgs[featKey]) * 100))
      .curve(d3.curveMonotoneX);
    root.append('path').datum(data)
      .attr('fill', 'none').attr('stroke', '#8b7568').attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '5 3').attr('opacity', 0)
      .attr('d', featLine)
      .transition().duration(500).attr('opacity', 0.7);
    root.selectAll('circle.journey-feat-dot')
      .data(data.filter((d) => Number.isFinite(d.featureAvgs[featKey])))
      .join('circle').attr('class', 'journey-feat-dot')
      .attr('cx', (d) => x(d.year)).attr('cy', (d) => y(clamp01(d.featureAvgs[featKey]) * 100))
      .attr('r', 3).attr('fill', '#8b7568').attr('opacity', 0)
      .transition().duration(500).attr('opacity', 0.55);
  }

  const popLine = d3.line()
    .defined((d) => Number.isFinite(d.avgPopularity))
    .x((d) => x(d.year)).y((d) => y(d.avgPopularity))
    .curve(d3.curveMonotoneX);
  root.append('path').datum(data)
    .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2.5)
    .attr('d', popLine);

  const dots = root.selectAll('circle.journey-pop-dot')
    .data(data.filter((d) => Number.isFinite(d.avgPopularity)))
    .join('circle').attr('class', 'journey-pop-dot')
    .attr('cx', (d) => x(d.year)).attr('cy', (d) => y(d.avgPopularity))
    .attr('r', 5.5).attr('fill', color)
    .attr('stroke', '#fffaf6').attr('stroke-width', 2).style('cursor', 'pointer');

  attachDotTooltip(dots, tooltipEl, (d) => {
    const fv = d.featureAvgs[featKey];
    return `
      <strong>${d.year}</strong>
      <span>Popularity: ${Math.round(d.avgPopularity)}</span>
      ${featKey && Number.isFinite(fv) ? `<small>${state.soundFeature.label}: ${Math.round(fv * 100)}%</small>` : ''}
      <small>Top: "${d.topTrack?.track_name ?? '—'}"</small>
    `;
  });
}

function drawCompareChart(svgEl, state, artistDataMap, tooltipEl) {
  const { iW, iH, root } = journeyChartSetup(svgEl);
  root.selectAll('*').remove();

  const allData = JOURNEY_ARTISTS.flatMap((a) => artistDataMap[a.id] ?? []);
  const x = d3.scaleLinear().domain(d3.extent(allData, (d) => d.year)).range([0, iW]);
  const y = d3.scaleLinear().domain([0, 100]).range([iH, 0]);

  journeyAxes(root, x, y, iW, iH, 7);

  const lineGen = (data) => d3.line()
    .defined((d) => Number.isFinite(d.avgPopularity))
    .x((d) => x(d.year)).y((d) => y(d.avgPopularity))
    .curve(d3.curveMonotoneX)(data);

  JOURNEY_ARTISTS.filter((a) => a.id !== state.artist).forEach((artist) => {
    const aData = artistDataMap[artist.id] ?? [];
    if (!aData.length) return;
    root.append('path')
      .attr('fill', 'none').attr('stroke', GENRE_COLORS[artist.genre])
      .attr('stroke-width', 1.5).attr('opacity', 0.25)
      .attr('d', lineGen(aData));
  });

  const selData = artistDataMap[state.artist] ?? [];
  const selColor = GENRE_COLORS[state.genre] ?? '#c67b5c';
  root.append('path')
    .attr('fill', 'none').attr('stroke', selColor).attr('stroke-width', 2.5)
    .attr('d', lineGen(selData));

  const dots = root.selectAll('circle.journey-pop-dot')
    .data(selData.filter((d) => Number.isFinite(d.avgPopularity)))
    .join('circle').attr('class', 'journey-pop-dot')
    .attr('cx', (d) => x(d.year)).attr('cy', (d) => y(d.avgPopularity))
    .attr('r', 5).attr('fill', selColor)
    .attr('stroke', '#fffaf6').attr('stroke-width', 2).style('cursor', 'pointer');

  attachDotTooltip(dots, tooltipEl, (d) => `
    <strong>${d.year}</strong>
    <span>Popularity: ${Math.round(d.avgPopularity)}</span>
    <small>Top: "${d.topTrack?.track_name ?? '—'}"</small>
  `);
}

function drawGenreChart(svgEl, genreData, tooltipEl) {
  const { iW, iH, root } = journeyChartSetup(svgEl);
  root.selectAll('*').remove();

  const allData = Object.values(genreData).flat();
  const x = d3.scaleLinear().domain(d3.extent(allData, (d) => d.year)).range([0, iW]);
  const y = d3.scaleLinear().domain([0, 100]).range([iH, 0]);

  journeyAxes(root, x, y, iW, iH, 6);

  GENRES.forEach(({ id }) => {
    const gData = genreData[id] ?? [];
    if (!gData.length) return;
    const color = GENRE_COLORS[id];
    const lineGen = d3.line()
      .defined((d) => Number.isFinite(d.avgPopularity))
      .x((d) => x(d.year)).y((d) => y(d.avgPopularity))
      .curve(d3.curveMonotoneX);
    root.append('path').datum(gData)
      .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2)
      .attr('opacity', 0).attr('d', lineGen)
      .transition().duration(450).attr('opacity', 1);
  });
}

function drawFeatureTakeawayChart(svgEl, data, state, genreData, tooltipEl) {
  if (!data.length || !state.soundFeature) {
    drawGenreChart(svgEl, genreData, tooltipEl);
    return;
  }
  const featKey = state.soundFeature.key;
  const artistFeatData = data.filter((d) => Number.isFinite(d.featureAvgs[featKey]));
  if (artistFeatData.length < 2) {
    drawGenreChart(svgEl, genreData, tooltipEl);
    return;
  }

  const { iW, iH, root } = journeyChartSetup(svgEl);
  root.selectAll('*').remove();

  const color = GENRE_COLORS[state.genre] ?? '#c67b5c';
  const genreFeatData = (genreData[state.genre] ?? []).filter(
    (d) => Number.isFinite(d.featureAvgs?.[featKey]),
  );

  const allYears = [
    ...artistFeatData.map((d) => d.year),
    ...genreFeatData.map((d) => d.year),
  ];
  const x = d3.scaleLinear().domain(d3.extent(allYears)).range([0, iW]);
  const y = d3.scaleLinear().domain([0, 100]).range([iH, 0]);

  root.selectAll('.journey-grid').data([null]).join('g').attr('class', 'journey-grid')
    .call(d3.axisLeft(y).ticks(5).tickSize(-iW).tickFormat(''));
  root.selectAll('.x-axis').data([null]).join('g').attr('class', 'x-axis')
    .attr('transform', `translate(0,${iH})`)
    .call(d3.axisBottom(x).ticks(Math.min(artistFeatData.length, 8)).tickFormat(d3.format('d')).tickSizeOuter(0));
  root.selectAll('.y-axis').data([null]).join('g').attr('class', 'y-axis')
    .call(d3.axisLeft(y).ticks(5).tickSizeOuter(0));
  root.selectAll('.axis-label').data([null]).join('text').attr('class', 'axis-label')
    .attr('x', -iH / 2).attr('y', -42).attr('text-anchor', 'middle')
    .attr('transform', 'rotate(-90)').text(`${state.soundFeature.label} (0–100)`);

  if (genreFeatData.length > 1) {
    const genreLine = d3.line()
      .defined((d) => Number.isFinite(d.featureAvgs[featKey]))
      .x((d) => x(d.year)).y((d) => y(clamp01(d.featureAvgs[featKey]) * 100))
      .curve(d3.curveMonotoneX);
    root.append('path').datum(genreFeatData)
      .attr('fill', 'none').attr('stroke', '#8b7568').attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '5 3').attr('opacity', 0)
      .attr('d', genreLine)
      .transition().duration(500).attr('opacity', 0.6);
  }

  const artistLine = d3.line()
    .defined((d) => Number.isFinite(d.featureAvgs[featKey]))
    .x((d) => x(d.year)).y((d) => y(clamp01(d.featureAvgs[featKey]) * 100))
    .curve(d3.curveMonotoneX);
  root.append('path').datum(artistFeatData)
    .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2.5)
    .attr('opacity', 0).attr('d', artistLine)
    .transition().duration(500).attr('opacity', 1);

  const dots = root.selectAll('circle.journey-pop-dot')
    .data(artistFeatData)
    .join('circle').attr('class', 'journey-pop-dot')
    .attr('cx', (d) => x(d.year)).attr('cy', (d) => y(clamp01(d.featureAvgs[featKey]) * 100))
    .attr('r', 5.5).attr('fill', color)
    .attr('stroke', '#fffaf6').attr('stroke-width', 2).style('cursor', 'pointer');

  attachDotTooltip(dots, tooltipEl, (d) => `
    <strong>${d.year}</strong>
    <span>${state.soundFeature.label}: ${Math.round(clamp01(d.featureAvgs[featKey]) * 100)}</span>
    <small>Top: "${d.topTrack?.track_name ?? '—'}"</small>
  `);
}

function renderJourneyProgress(el, beat) {
  const steps = [
    { id: 'reveal', label: 'Journey' },
    { id: 'sound', label: 'Sound' },
    { id: 'compare', label: 'Compare' },
    { id: 'genre', label: 'Big picture' },
  ];
  const order = steps.map((s) => s.id);
  const currentIdx = order.indexOf(beat);
  el.replaceChildren();
  steps.forEach((step, i) => {
    const span = document.createElement('span');
    span.className = 'journey-progress__step';
    if (i < currentIdx) span.classList.add('is-done');
    if (i === currentIdx) span.classList.add('is-active');
    span.textContent = step.label;
    el.append(span);
    if (i < steps.length - 1) {
      const sep = document.createElement('span');
      sep.className = 'journey-progress__sep';
      sep.textContent = '›';
      el.append(sep);
    }
  });
}

function renderJourneyLegend(legendEl, beat, state) {
  legendEl.replaceChildren();
  if (beat === 'reveal') {
    const color = GENRE_COLORS[state.genre] ?? '#c67b5c';
    const item = document.createElement('span');
    item.className = 'journey-legend__item';
    item.style.setProperty('--legend-color', color);
    item.innerHTML = '<i></i> Popularity';
    legendEl.append(item);
  } else if (beat === 'sound') {
    const color = GENRE_COLORS[state.genre] ?? '#c67b5c';
    const pop = document.createElement('span');
    pop.className = 'journey-legend__item';
    pop.style.setProperty('--legend-color', color);
    pop.innerHTML = '<i></i> Popularity';
    legendEl.append(pop);
    if (state.soundFeature) {
      const feat = document.createElement('span');
      feat.className = 'journey-legend__item is-dashed';
      feat.style.setProperty('--legend-color', '#8b7568');
      feat.innerHTML = `<i></i> ${state.soundFeature.label} (×100)`;
      legendEl.append(feat);
    }
  } else if (beat === 'compare') {
    const isCustom = !JOURNEY_ARTISTS.some((a) => a.id === state.artist);
    if (isCustom) {
      const color = GENRE_COLORS[state.genre] ?? '#c67b5c';
      const item = document.createElement('span');
      item.className = 'journey-legend__item';
      item.style.setProperty('--legend-color', color);
      item.innerHTML = `<i></i> ${state.artist}`;
      legendEl.append(item);
    }
    JOURNEY_ARTISTS.forEach((artist) => {
      const color = GENRE_COLORS[artist.genre] ?? '#c67b5c';
      const item = document.createElement('span');
      item.className = 'journey-legend__item';
      item.style.setProperty('--legend-color', color);
      item.style.opacity = artist.id === state.artist ? '1' : (isCustom ? '0.3' : '0.45');
      item.innerHTML = `<i></i> ${artist.label}`;
      legendEl.append(item);
    });
  } else if (beat === 'genre') {
    const artistColor = GENRE_COLORS[state.genre] ?? '#c67b5c';
    const artistItem = document.createElement('span');
    artistItem.className = 'journey-legend__item';
    artistItem.style.setProperty('--legend-color', artistColor);
    artistItem.innerHTML = `<i></i> ${state.artist}`;
    legendEl.append(artistItem);
    const genreItem = document.createElement('span');
    genreItem.className = 'journey-legend__item is-dashed';
    genreItem.style.setProperty('--legend-color', '#8b7568');
    const genreLabel = state.genre ? state.genre.charAt(0).toUpperCase() + state.genre.slice(1) : 'Genre';
    genreItem.innerHTML = `<i></i> ${genreLabel} avg`;
    legendEl.append(genreItem);
  }
}

function renderNarrativePanel(el, state, data, onAdvance, onSoundGuess) {
  el.replaceChildren();
  el.style.setProperty('--narrative-color', GENRE_COLORS[state.genre] ?? 'var(--accent)');
  const { beat, yearIndex, artist, soundFeature, soundGuess, genre } = state;

  if (beat === 'reveal') {
    const curr = data[yearIndex];
    const prev = yearIndex > 0 ? data[yearIndex - 1] : null;
    const isLast = yearIndex >= data.length - 1;
    const nextYear = !isLast ? data[yearIndex + 1]?.year : null;
    const change = prev ? Math.round(curr.avgPopularity - prev.avgPopularity) : null;

    let changeHtml = '';
    if (change === null) {
      changeHtml = '<p class="narrative-change is-neutral">First year in dataset</p>';
    } else if (change === 0) {
      changeHtml = `<p class="narrative-change is-neutral">No change from ${prev.year}</p>`;
    } else {
      const dir = change > 0 ? 'up' : 'down';
      changeHtml = `<p class="narrative-change is-${dir}">${change > 0 ? '▲' : '▼'} ${Math.abs(change)} pts from ${prev.year}</p>`;
    }

    el.innerHTML = `
      <p class="label">Artist journey</p>
      <h3>${artist}</h3>
      <div class="narrative-year-block">
        <span class="narrative-year">${curr.year}</span>
        <div class="narrative-pop">
          <span class="narrative-pop__score">${Math.round(curr.avgPopularity)}</span>
          <span class="narrative-pop__label">/ 100 popularity</span>
        </div>
      </div>
      ${changeHtml}
      <p class="narrative-track">Top track: <em>"${curr.topTrack?.track_name ?? '—'}"</em></p>
      <p class="narrative-meta">${curr.count} track${curr.count !== 1 ? 's' : ''} averaged this year</p>
      <div class="narrative-footer">
        <p class="narrative-year-count">Year ${yearIndex + 1} of ${data.length}</p>
        <button type="button" class="btn-journey-next" id="btn-journey-next">
          ${isLast ? 'What shaped this sound? →' : `Next: ${nextYear} →`}
        </button>
        ${!isLast ? '<button type="button" class="btn-journey-skip" id="btn-journey-skip">Skip to full arc →</button>' : ''}
      </div>
    `;
  } else if (beat === 'soundguess') {
    const name = artist.split(' ')[0];
    el.innerHTML = `
      <p class="label">Your turn</p>
      <h3>What shaped ${name}'s sound?</h3>
      <p>You've seen the full popularity arc. Which audio trait do you think tracked it most closely?</p>
      <div class="journey-guess-grid" id="journey-guess-grid"></div>
    `;
    const grid = el.querySelector('#journey-guess-grid');
    JOURNEY_OVERLAY_FEATURES.forEach((feat) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'journey-guess-btn';
      btn.textContent = feat.label;
      btn.addEventListener('click', () => { if (onSoundGuess) onSoundGuess(feat.key); });
      grid.append(btn);
    });
  } else if (beat === 'sound') {
    const name = artist.split(' ')[0];
    const narrative = soundFeature ? buildSoundNarrative(artist, soundFeature) : '';
    const guessedFeat = JOURNEY_OVERLAY_FEATURES.find((f) => f.key === soundGuess);
    const correct = soundGuess === soundFeature?.key;
    let resultLine = '';
    if (soundGuess && soundFeature) {
      resultLine = correct
        ? `<p class="narrative-guess-result is-correct">✓ You got it — it was ${soundFeature.label.toLowerCase()}.</p>`
        : `<p class="narrative-guess-result is-wrong">✗ You picked ${guessedFeat?.label ?? soundGuess} — it was actually ${soundFeature.label.toLowerCase()}.</p>`;
    }
    el.innerHTML = `
      <p class="label">The reveal</p>
      <h3>${soundFeature ? soundFeature.label : 'The sound'}</h3>
      ${resultLine}
      <p>${narrative}</p>
      ${soundFeature ? `<p class="narrative-meta">Dashed line = ${soundFeature.label.toLowerCase()}, scaled 0–100.</p>` : ''}
      <div class="narrative-footer">
        <button type="button" class="btn-journey-next" id="btn-journey-next">Zoom out →</button>
      </div>
    `;
  } else if (beat === 'compare') {
    el.innerHTML = `
      <p class="label">The comparison</p>
      <h3>How does ${artist.split(' ')[0]} compare?</h3>
      <p>Every artist's arc, overlaid. ${artist.split(' ')[0]} is highlighted — others are dimmed. Notice how genre and era shape each trajectory.</p>
      <p class="narrative-meta">Rap and pop acts in the dataset tend to have different curves from legacy rock acts, partly because older catalogs skew toward earlier streaming adoption.</p>
      <div class="narrative-footer">
        <button type="button" class="btn-journey-next" id="btn-journey-next">The genre picture →</button>
      </div>
    `;
  } else if (beat === 'genre') {
    const name = artist.split(' ')[0];
    const genreLabel = genre ? genre.charAt(0).toUpperCase() + genre.slice(1) : 'their genre';
    let title, body, meta;
    if (soundFeature) {
      const featLabel = soundFeature.label.toLowerCase();
      let trending;
      if (soundFeature.r > 0.3) {
        trending = `${name}'s ${featLabel} rose alongside their popularity`;
      } else if (soundFeature.r < -0.3) {
        trending = `${name}'s ${featLabel} fell as their popularity grew`;
      } else {
        trending = `${name}'s ${featLabel} held relatively steady`;
      }
      title = `${name} vs. ${genreLabel}`;
      body = `${trending} — but were they following the ${genreLabel} trend or bucking it? The solid line is ${name}; the dashed line is the ${genreLabel} genre average. See if they led the trend, tracked it, or went their own way.`;
      meta = `Feature values run 0–100. Dashed line: ${genreLabel} genre average for ${featLabel}. Dataset collected ~2020.`;
    } else {
      title = 'The genre picture';
      body = `Each line is the year-by-year average popularity across every track in that genre (1990–2020). Genres that thrived in the streaming era show a rising arc into the 2010s.`;
      meta = 'The dataset was collected ~2020. Popularity reflects current Spotify streams, not the year a track was released.';
    }
    el.innerHTML = `
      <p class="label">The takeaway</p>
      <h3>${title}</h3>
      <p>${body}</p>
      <p class="narrative-meta">${meta}</p>
      <div class="narrative-footer">
        <button type="button" class="btn-journey-next" id="btn-journey-next">Try another artist →</button>
      </div>
    `;
  }

  el.querySelector('#btn-journey-next')?.addEventListener('click', () => onAdvance('next'));
  el.querySelector('#btn-journey-skip')?.addEventListener('click', () => onAdvance('skip'));
}

function setArtistJourneyChartOpen(open) {
  const section = document.getElementById('artist-journey');
  if (!section) return;
  section.classList.toggle('is-journey-chart-open', open);
}

function initArtistJourney(pool) {
  const pickPanel = document.getElementById('journey-pick-panel');
  const storyPanel = document.getElementById('journey-story');
  const pickerEl = document.getElementById('artist-picker');
  const startBtn = document.getElementById('btn-journey-start');
  const svgEl = document.getElementById('journey-chart');
  const tooltipEl = document.getElementById('journey-tooltip');
  const legendEl = document.getElementById('journey-legend');
  const narrativeEl = document.getElementById('journey-narrative');
  const progressEl = document.getElementById('journey-progress');
  if (!pickPanel || !storyPanel || !pickerEl || !svgEl) return;

  const artistDataMap = {};
  JOURNEY_ARTISTS.forEach((a) => { artistDataMap[a.id] = buildArtistJourneyData(pool, a.id); });
  const genreData = buildGenreJourneyData(pool);

  const state = {
    artist: JOURNEY_ARTISTS[0].id,
    genre: JOURNEY_ARTISTS[0].genre,
    beat: 'pick',
    yearIndex: 0,
    soundFeature: null,
    soundGuess: null,
  };

  JOURNEY_ARTISTS.forEach((artist) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'artist-pick-btn';
    btn.textContent = artist.label;
    btn.dataset.artist = artist.id;
    btn.style.setProperty('--artist-color', GENRE_COLORS[artist.genre]);
    btn.addEventListener('click', () => {
      state.artist = artist.id;
      state.genre = artist.genre;
      pickerEl.querySelectorAll('.artist-pick-btn').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.artist === state.artist);
      });
      clearSearch();
    });
    pickerEl.append(btn);
  });
  pickerEl.querySelector('.artist-pick-btn').classList.add('is-active');

  // "Other artists" toggle button — lives inside artist-picker, inline with presets
  const searchToggleBtn = document.createElement('button');
  searchToggleBtn.type = 'button';
  searchToggleBtn.id = 'artist-search-toggle';
  searchToggleBtn.className = 'artist-search-toggle';
  searchToggleBtn.textContent = 'Other popular artists';
  pickerEl.append(searchToggleBtn);

  // Custom artist search — artists with 5+ distinct years all from 2000 onwards
  const artistYearSets = {};
  pool.forEach((t) => {
    if (!t.track_artist || !t.track_album_release_date) return;
    const year = +t.track_album_release_date.slice(0, 4);
    if (!year || year < 2000) return;
    if (!artistYearSets[t.track_artist]) artistYearSets[t.track_artist] = new Set();
    artistYearSets[t.track_artist].add(year);
  });
  const allArtistIds = Object.entries(artistYearSets)
    .filter(([, years]) => years.size >= 7)
    .map(([id]) => id)
    .sort((a, b) => a.localeCompare(b));

  function inferArtistGenre(artistId) {
    const tracks = pool.filter((t) => t.track_artist === artistId);
    if (!tracks.length) return 'pop';
    const counts = {};
    tracks.forEach((t) => { counts[t.playlist_genre] = (counts[t.playlist_genre] ?? 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'pop';
  }

  const searchInputEl = document.getElementById('artist-search-input');
  const searchResultsEl = document.getElementById('artist-search-results');
  const searchWrapEl = document.getElementById('artist-search-wrap');
  // Move inline into artist-picker so it sits next to the toggle button
  if (searchWrapEl) pickerEl.append(searchWrapEl);

  function setSearchStatus(msg, type) {
    if (!searchWrapEl) return;
    let el = searchWrapEl.querySelector('.artist-search-status');
    if (!msg) { el?.remove(); return; }
    if (!el) {
      el = document.createElement('p');
      el.className = 'artist-search-status';
      searchWrapEl.append(el);
    }
    el.textContent = msg;
    el.className = `artist-search-status ${type ?? ''}`;
  }

  const searchToggleEl = document.getElementById('artist-search-toggle');

  function closeSearchResults() {
    if (searchResultsEl) searchResultsEl.hidden = true;
  }

  function clearSearch() {
    if (searchInputEl) {
      searchInputEl.value = '';
      searchInputEl.classList.remove('is-selected');
    }
    closeSearchResults();
    setSearchStatus('');
    searchToggleBtn.classList.remove('is-active');
    if (searchWrapEl) searchWrapEl.hidden = true;
  }

  searchToggleEl?.addEventListener('click', () => {
    if (!searchWrapEl) return;
    const opening = searchWrapEl.hidden;
    searchWrapEl.hidden = !opening;
    searchToggleBtn.classList.toggle('is-active', opening);
    if (opening) searchInputEl?.focus();
  });

  function selectCustomArtist(artistId) {
    if (!artistDataMap[artistId]) {
      artistDataMap[artistId] = buildArtistJourneyData(pool, artistId);
    }
    const data = artistDataMap[artistId];
    if (data.length < 1) {
      if (searchInputEl) searchInputEl.value = artistId;
      closeSearchResults();
      setSearchStatus(`No data found for "${artistId}" — try a more prominent artist.`, 'is-error');
      searchInputEl?.classList.remove('is-selected');
      return;
    }
    state.artist = artistId;
    state.genre = inferArtistGenre(artistId);
    pickerEl.querySelectorAll('.artist-pick-btn').forEach((b) => b.classList.remove('is-active'));
    if (searchInputEl) {
      searchInputEl.value = artistId;
      searchInputEl.classList.add('is-selected');
    }
    closeSearchResults();
    if (data.length < 3) {
      setSearchStatus(`Found ${data.length} year${data.length !== 1 ? 's' : ''} of data — journey may be brief.`, 'is-warn');
    } else {
      setSearchStatus('');
    }
  }

  function showSearchResults(matches) {
    if (!searchResultsEl) return;
    searchResultsEl.replaceChildren();
    matches.forEach((name) => {
      const li = document.createElement('li');
      li.className = 'artist-search-result';
      li.setAttribute('role', 'option');
      li.textContent = name;
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectCustomArtist(name);
      });
      searchResultsEl.append(li);
    });
    searchResultsEl.hidden = false;
  }

  searchInputEl?.addEventListener('input', () => {
    const q = searchInputEl.value.trim().toLowerCase();
    searchInputEl.classList.remove('is-selected');
    if (q.length < 2) { closeSearchResults(); return; }
    const matches = allArtistIds.filter((a) => a.toLowerCase().includes(q)).slice(0, 10);
    if (!matches.length) { closeSearchResults(); return; }
    showSearchResults(matches);
  });

  searchInputEl?.addEventListener('blur', () => { setTimeout(closeSearchResults, 150); });

  searchInputEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeSearchResults(); searchInputEl.blur(); }
    if (e.key === 'Enter') {
      const first = searchResultsEl?.querySelector('.artist-search-result');
      if (first) { selectCustomArtist(first.textContent); }
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#artist-search-wrap')) closeSearchResults();
  });

  const nowPlayingEl = document.getElementById('journey-now-playing');
  const nowPlayingLabelEl = document.getElementById('journey-now-playing-label');
  const nowPlayingEmbedEl = document.getElementById('journey-now-playing-embed');

  function getArtistTopTrack(artistId) {
    const data = artistDataMap[artistId] ?? [];
    return data
      .map((d) => d.topTrack)
      .filter(Boolean)
      .sort((a, b) => b.track_popularity - a.track_popularity)[0] ?? null;
  }

  function showNowPlaying(artistId) {
    if (!nowPlayingEl || !nowPlayingEmbedEl) return;
    const track = getArtistTopTrack(artistId);
    if (!track?.track_id) { nowPlayingEl.hidden = true; return; }
    const artistLabel = JOURNEY_ARTISTS.find((a) => a.id === artistId)?.label ?? artistId;
    if (nowPlayingLabelEl) nowPlayingLabelEl.textContent = `${artistLabel}'s most popular song`;
    nowPlayingEmbedEl.replaceChildren();
    const iframe = document.createElement('iframe');
    iframe.src = `https://open.spotify.com/embed/track/${encodeURIComponent(track.track_id)}?utm_source=generator&autoplay=1`;
    iframe.width = '100%';
    iframe.height = '80';
    iframe.setAttribute('frameborder', '0');
    iframe.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
    iframe.title = `${artistLabel}'s most popular song: ${track.track_name}`;
    nowPlayingEmbedEl.appendChild(iframe);
    nowPlayingEl.hidden = false;
  }

  function hideNowPlaying() {
    if (!nowPlayingEl) return;
    nowPlayingEl.hidden = true;
    if (nowPlayingEmbedEl) nowPlayingEmbedEl.replaceChildren();
  }

  const journeySection = document.getElementById('artist-journey');

  function resetJourney() {
    state.beat = 'pick';
    state.yearIndex = 0;
    state.soundFeature = null;
    state.soundGuess = null;
    // Restore preset button selection to default
    const defaultArtist = JOURNEY_ARTISTS.find((a) => a.id === state.artist) ?? JOURNEY_ARTISTS[0];
    state.artist = defaultArtist.id;
    state.genre = defaultArtist.genre;
    pickerEl.querySelectorAll('.artist-pick-btn').forEach((b) => {
      b.disabled = false;
      b.classList.toggle('is-active', b.dataset.artist === defaultArtist.id);
    });
    clearSearch();
    if (searchWrapEl) searchWrapEl.hidden = true;
    pickPanel.classList.remove('is-compact');
    storyPanel.hidden = true;
    setArtistJourneyChartOpen(false);
    journeySection?.classList.remove('is-journey-active');
    if (progressEl) progressEl.hidden = true;
    if (tooltipEl) tooltipEl.hidden = true;
    hideNowPlaying();
    d3.select(svgEl).selectAll('g.journey-root').selectAll('*').remove();
    if (legendEl) legendEl.replaceChildren();
    if (narrativeEl) narrativeEl.replaceChildren();
  }

  startBtn.addEventListener('click', () => {
    state.beat = 'reveal';
    state.yearIndex = 0;
    state.soundFeature = null;
    state.soundGuess = null;
    pickerEl.querySelectorAll('.artist-pick-btn').forEach((b) => { b.disabled = true; });
    pickPanel.classList.add('is-compact');
    storyPanel.hidden = false;
    setArtistJourneyChartOpen(true);
    journeySection?.classList.add('is-journey-active');
    if (progressEl) progressEl.hidden = false;
    showNowPlaying(state.artist);
    d3.select(svgEl).selectAll('g.journey-root').selectAll('*').remove();
    render();
  });

  document.getElementById('btn-journey-reset')?.addEventListener('click', resetJourney);

  function onSoundGuess(featureKey) {
    state.soundGuess = featureKey;
    state.beat = 'sound';
    render();
  }

  function advance(action) {
    const data = artistDataMap[state.artist] ?? [];
    if (state.beat === 'reveal') {
      if (action === 'skip' || state.yearIndex >= data.length - 1) {
        state.soundFeature = findMostCorrelatedFeature(data);
        state.beat = 'soundguess';
      } else {
        state.yearIndex++;
      }
    } else if (state.beat === 'soundguess') {
      state.beat = 'sound';
    } else if (state.beat === 'sound') {
      state.beat = 'compare';
    } else if (state.beat === 'compare') {
      state.beat = 'genre';
    } else if (state.beat === 'genre') {
      resetJourney();
      return;
    }
    render();
  }

  function render() {
    if (state.beat === 'pick') return;
    const data = artistDataMap[state.artist] ?? [];
    if (tooltipEl) tooltipEl.hidden = true;

    const beatForProgress = state.beat === 'soundguess' ? 'sound' : state.beat;
    renderJourneyProgress(progressEl, beatForProgress);

    if (state.beat === 'reveal') drawRevealChart(svgEl, data, state, tooltipEl);
    else if (state.beat === 'soundguess') drawRevealChart(svgEl, data, { ...state, yearIndex: data.length - 1 }, tooltipEl);
    else if (state.beat === 'sound') drawSoundChart(svgEl, data, state, tooltipEl);
    else if (state.beat === 'compare') drawCompareChart(svgEl, state, artistDataMap, tooltipEl);
    else if (state.beat === 'genre') drawFeatureTakeawayChart(svgEl, data, state, genreData, tooltipEl);

    const beatForLegend = state.beat === 'soundguess' ? 'reveal' : state.beat;
    if (legendEl) renderJourneyLegend(legendEl, beatForLegend, state);
    if (narrativeEl) renderNarrativePanel(narrativeEl, state, data, advance, onSoundGuess);
  }

  const resizeObserver = new ResizeObserver(() => { if (state.beat !== 'pick') render(); });
  resizeObserver.observe(svgEl);
}

function initStoryScroll() {
  const story = document.querySelector('.story-scroll');
  if (!story) return;

  const chapters = [
    document.getElementById('genre-guess'),
    document.getElementById('genre-explorer'),
    document.getElementById('performance-explorer'),
    document.getElementById('artist-journey'),
  ].filter(Boolean);
  const summaryEl = document.getElementById('game-summary');
  if (!chapters.length) return;

  const spacerCount = story.querySelectorAll('.story-scroll__spacer').length;
  if (spacerCount !== chapters.length) {
    story.querySelectorAll('.story-scroll__spacer').forEach((spacer) => spacer.remove());
    chapters.forEach(() => {
      const spacer = document.createElement('div');
      spacer.className = 'story-scroll__spacer';
      spacer.setAttribute('aria-hidden', 'true');
      story.append(spacer);
    });
  }

  const stage = story.querySelector('.story-stage');
  const spacers = [...story.querySelectorAll('.story-scroll__spacer')];
  const stickyTopPx = stage
    ? parseFloat(getComputedStyle(stage).top) || 16
    : 16;
  let activeIndex = -1;

  function updateSummaryForChapter(index) {
    const guess = document.getElementById('genre-guess');
    const guessComplete = guess?.classList.contains('is-complete');
    const showSummary = index === 0 && guessComplete;

    if (guess && index === 0) {
      guess.classList.toggle('is-story-active', !showSummary);
    }

    if (!summaryEl) return;
    summaryEl.hidden = !showSummary;
    summaryEl.classList.toggle('is-story-active', showSummary);
    summaryEl.toggleAttribute('inert', !showSummary);
    summaryEl.setAttribute('aria-hidden', String(!showSummary));
  }

  function setActive(index) {
    if (index !== activeIndex) {
      activeIndex = index;
      chapters.forEach((chapter, i) => {
        const active = i === index;
        chapter.hidden = !active;
        chapter.classList.toggle('is-story-active', active);
        chapter.toggleAttribute('inert', !active);
        chapter.setAttribute('aria-hidden', String(!active));
      });
    }
    updateSummaryForChapter(index);
  }

  refreshStoryChapter = () => {
    if (window.matchMedia('(max-width: 860px)').matches) return;
    setActive(activeIndex < 0 ? 0 : activeIndex);
  };

  function spacerScrollDistance() {
    return Math.max(
      1,
      spacers.reduce((sum, el) => sum + el.offsetHeight, 0),
    );
  }

  /** Fixed stage height for scroll math (visual stage may shrink for guess/summary) */
  function storyStageScrollHeight() {
    return Math.max(320, window.innerHeight - 32);
  }

  /** Progress through spacer stack only, after the sticky stage has pinned */
  function storyScrollProgress() {
    const storyTop = story.getBoundingClientRect().top;
    if (storyTop > stickyTopPx) return 0;

    const scrolledIntoStory = stickyTopPx - storyTop;
    const throughSpacers = Math.max(0, scrolledIntoStory - storyStageScrollHeight());
    return Math.min(0.999, throughSpacers / spacerScrollDistance());
  }

  function chapterFromProgress(progress, n) {
    return Math.min(n - 1, Math.floor(progress * n));
  }

  function resolveChapter(progress, n) {
    const candidate = chapterFromProgress(progress, n);
    if (activeIndex < 0) return candidate;

    const hyst = 0.1 / n;
    if (candidate > activeIndex) {
      const boundary = candidate / n;
      return progress >= boundary - hyst ? candidate : activeIndex;
    }
    if (candidate < activeIndex) {
      const boundary = activeIndex / n;
      return progress < boundary - hyst ? candidate : activeIndex;
    }
    return activeIndex;
  }

  function update() {
    if (window.matchMedia('(max-width: 860px)').matches) {
      activeIndex = 0;
      chapters.forEach((chapter) => {
        chapter.hidden = false;
        chapter.classList.remove('is-story-active');
        chapter.removeAttribute('inert');
        chapter.removeAttribute('aria-hidden');
      });
      if (summaryEl) {
        const guessComplete = document.getElementById('genre-guess')?.classList.contains('is-complete');
        summaryEl.hidden = !guessComplete;
        summaryEl.classList.remove('is-story-active');
        summaryEl.removeAttribute('inert');
        summaryEl.removeAttribute('aria-hidden');
      }
      return;
    }

    const n = chapters.length;
    setActive(resolveChapter(storyScrollProgress(), n));
  }

  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);

  function scrollToChapter(targetIndex) {
    if (window.matchMedia('(max-width: 860px)').matches) return;
    if (targetIndex < 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const n = chapters.length;
    const clamped = Math.min(n - 1, targetIndex);
    const targetProgress = (clamped + 0.5) / n;
    const throughSpacers = targetProgress * spacerScrollDistance();
    const scrolledIntoStory = throughSpacers + storyStageScrollHeight();
    const storyDocTop = story.getBoundingClientRect().top + window.scrollY;
    const targetScrollY = storyDocTop - stickyTopPx + scrolledIntoStory;
    window.scrollTo({ top: targetScrollY, behavior: 'smooth' });
  }

  const arrowHintEl = document.getElementById('arrow-nav-hint');
  let arrowHintDismissed = false;

  function dismissArrowHint() {
    if (arrowHintDismissed) return;
    arrowHintDismissed = true;
    arrowHintEl?.classList.add('is-hidden');
  }

  window.addEventListener('keydown', (e) => {
    if (window.matchMedia('(max-width: 860px)').matches) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      dismissArrowHint();
      scrollToChapter(activeIndex + 1);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      dismissArrowHint();
      scrollToChapter(activeIndex - 1);
    }
  });
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

function wireGenreButtons(getTracks, state) {
  document.querySelectorAll('.genre-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      onGuess(getTracks(), state, btn.dataset.genre);
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
  let tracks = pickRandomTracks(pool, TRACK_COUNT);

  const state = {
    activeIndex: 0,
    answers: Array(TRACK_COUNT).fill(null),
  };

  function resetGuessGame() {
    tracks = pickRandomTracks(pool, TRACK_COUNT);
    state.activeIndex = 0;
    state.answers = Array(TRACK_COUNT).fill(null);

    const summary = document.getElementById('game-summary');
    const playAgain = document.getElementById('btn-play-again');
    const guess = document.getElementById('genre-guess');
    if (summary) summary.hidden = true;
    if (playAgain) playAgain.hidden = true;
    guess?.classList.remove('is-complete');

    updatePanel(tracks, state);
    refreshStoryChapter();
    requestAnimationFrame(() => {
      document.querySelector('.story-scroll')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }

  wireGenreButtons(() => tracks, state);
  wireSpotifyPlayButton();
  initGenreExplorer(pool);
  initRandomTrackPlayer(pool);
  initPerformanceExplorer(pool);
  initArtistJourney(pool);
  initStoryScroll();

  document.getElementById('btn-next-track').addEventListener('click', () => {
    onNextTrack(tracks, state);
  });

  document.getElementById('btn-play-again')?.addEventListener('click', resetGuessGame);

  updatePanel(tracks, state);
}

init().catch((err) => {
  console.error(err);
  document.querySelector('.genre-guess').insertAdjacentHTML(
    'beforeend',
    '<p class="section-note">Could not load data. Serve this folder with a local server (e.g. python3 -m http.server).</p>',
  );
});
