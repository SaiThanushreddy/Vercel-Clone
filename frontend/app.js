const API_URL = 'http://localhost:9000';

const form = document.getElementById('deploy-form');
const input = document.getElementById('git-url');
const deployBtn = document.getElementById('deploy-btn');
const btnText = deployBtn.querySelector('.btn-text');
const btnLoader = deployBtn.querySelector('.btn-loader');
const resultSection = document.getElementById('result');
const projectSlug = document.getElementById('project-slug');
const projectUrl = document.getElementById('project-url');
const logsSection = document.getElementById('logs-section');
const logsContainer = document.getElementById('logs');

let socket = null;

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const gitURL = input.value.trim();
  if (!gitURL) return;

  // UI: loading state
  deployBtn.disabled = true;
  btnText.classList.add('hidden');
  btnLoader.classList.remove('hidden');
  resultSection.classList.add('hidden');
  logsSection.classList.add('hidden');
  logsContainer.innerHTML = '<p class="log-line waiting">Waiting for build to start...</p>';

  try {
    const res = await fetch(`${API_URL}/project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gitURL }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || data.details?.join(', ') || 'Deployment failed');
    }

    // Show result
    projectSlug.textContent = data.data.projectSlug;
    projectUrl.textContent = data.data.url;
    projectUrl.href = data.data.url;
    resultSection.classList.remove('hidden');
    logsSection.classList.remove('hidden');

    // Connect to logs
    connectToLogs(data.data.projectSlug);
  } catch (err) {
    logsSection.classList.remove('hidden');
    logsContainer.innerHTML = `<p class="log-line error">${err.message}</p>`;
  } finally {
    deployBtn.disabled = false;
    btnText.classList.remove('hidden');
    btnLoader.classList.add('hidden');
  }
});

function connectToLogs(slug) {
  if (socket) {
    socket.disconnect();
  }

  socket = io(API_URL);

  socket.on('connect', () => {
    socket.emit('subscribe', `logs:${slug}`);
  });

  socket.on('message', (message) => {
    // Remove waiting message
    const waiting = logsContainer.querySelector('.waiting');
    if (waiting) waiting.remove();

    let parsed;
    try {
      parsed = JSON.parse(message);
    } catch {
      parsed = { log: message };
    }

    const line = document.createElement('p');
    line.classList.add('log-line');

    const text = parsed.log || message;
    line.textContent = `> ${text}`;

    if (text.toLowerCase().includes('error') || text.toLowerCase().includes('failed')) {
      line.classList.add('error');
    } else if (text.toLowerCase().includes('complete') || text.toLowerCase().includes('done')) {
      line.classList.add('success');
    }

    logsContainer.appendChild(line);
    logsContainer.scrollTop = logsContainer.scrollHeight;
  });
}
