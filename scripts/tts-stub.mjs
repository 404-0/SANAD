import { createServer } from 'node:http';
import { appendFileSync } from 'node:fs';

/**
 * A fake speech API for the tests (scripts/test-tts.mjs).
 *
 * It runs as its own process on purpose: the test drives the real generator
 * with execFileSync, which blocks the event loop, so a stub living in the same
 * process could never answer a request.
 *
 *   node scripts/tts-stub.mjs <mode> <port> <log-file>
 *
 * Every request is appended to the log as JSON so the test can assert on what
 * was actually sent — headers, path and body — rather than on what we intended
 * to send.
 */

const [mode, port, logFile] = process.argv.slice(2);
let calls = 0;

const audio = (res) => {
  res.writeHead(200, { 'content-type': 'audio/mpeg' });
  res.end(Buffer.from('RIFFfakeaudio'));
};

const fail = (res, status, payload, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(payload));
};

const MODES = {
  ok: (req, res) => {
    // ElevenLabs asks the account which voices it has before generating.
    if (req.url.endsWith('/v1/voices')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(
        JSON.stringify({
          voices: [
            { voice_id: 'basic123', name: 'Basic', high_quality_base_model_ids: ['eleven_english_v1'] },
            { voice_id: 'multi456', name: 'Layla', high_quality_base_model_ids: ['eleven_multilingual_v2'] },
          ],
        }),
      );
    }
    return audio(res);
  },

  google: (req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ audioContent: Buffer.from('fake-mp3-bytes').toString('base64') }));
  },

  // Groq's free tier: a few clips, then the daily cap with a long retry-after.
  cap: (req, res) =>
    calls > 5
      ? fail(res, 429, { error: { message: 'rate limit reached for orpheus' } }, { 'retry-after': '3600' })
      : audio(res),

  // "You are going too fast" — worth waiting out.
  slow: (req, res) =>
    calls === 1
      ? fail(res, 429, { error: { message: 'slow down' } }, { 'retry-after': '1' })
      : audio(res),

  badvoice: (req, res, body) => {
    const voice = /voice name="([^"]+)"/.exec(body)?.[1] || JSON.parse(body || '{}').voice;
    return voice === 'noura'
      ? fail(res, 400, {
          error: { message: 'voice must be one of the following voices: [fahad sultan aisha]' },
        })
      : audio(res);
  },

  // ElevenLabs free plan: the account lists voices it is not allowed to use.
  // Only the voice the account owns ("cloned") is accepted.
  freeplan: (req, res) => {
    if (req.url.endsWith('/v1/voices')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(
        JSON.stringify({
          voices: [
            { voice_id: 'library1', name: 'Rachel', category: 'premade', high_quality_base_model_ids: ['eleven_multilingual_v2'] },
            { voice_id: 'mine9', name: 'My Voice', category: 'cloned', high_quality_base_model_ids: [] },
          ],
        }),
      );
    }
    return req.url.includes('mine9')
      ? audio(res)
      : fail(res, 400, {
          detail: { message: 'Free users cannot use library voices via the API. Please upgrade your subscription to use this voice.' },
        });
  },

  // Same plan limit, but nothing in the account is usable.
  noneusable: (req, res) => {
    if (req.url.endsWith('/v1/voices')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(
        JSON.stringify({ voices: [{ voice_id: 'library1', name: 'Rachel', category: 'premade' }] }),
      );
    }
    return fail(res, 400, {
      detail: { message: 'Free users cannot use library voices via the API. Please upgrade your subscription to use this voice.' },
    });
  },

  terms: (req, res) =>
    fail(res, 400, { error: { message: 'requires terms acceptance', code: 'model_terms_required' } }),

  denied: (req, res) => fail(res, 401, { error: { message: 'invalid subscription key' } }),
};

createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    calls += 1;
    appendFileSync(
      logFile,
      `${JSON.stringify({ url: req.url, method: req.method, headers: req.headers, body })}\n`,
    );
    (MODES[mode] || MODES.ok)(req, res, body);
  });
}).listen(Number(port), () => process.stdout.write('ready\n'));
