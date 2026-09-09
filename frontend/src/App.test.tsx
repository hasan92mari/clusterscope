import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const jsonResponse = (data: unknown) => Promise.resolve(
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
);

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/config') {
        return jsonResponse({
          podIp: '10.0.0.15', namespace: 'clusterscope', appName: 'clusterscope-frontend',
          podName: 'frontend-abc', nodeName: 'worker-node-a', podStartTime: null, restartCount: 2,
        });
      }
      if (url === '/api/session/status') return jsonResponse({ connected: true });
      if (url === '/api/preferences') return jsonResponse({ name: '', language: 'en', theme: 'light' });
      return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
    }));
  });

  afterEach(() => vi.restoreAllMocks());

  it('renders Redis as a simple connectivity card', async () => {
    render(<App />);

    expect(screen.getByText('ClusterScope')).toBeInTheDocument();
    expect(await screen.findByText('10.0.0.15')).toBeInTheDocument();
    expect(await screen.findByText('● Connected')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Enter magic number')).not.toBeInTheDocument();
    expect(screen.queryByText('Your magic number is:')).not.toBeInTheDocument();
  });

  it('loads the shared Redis preferences and greets the user', async () => {
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
      if (input.toString() === '/api/preferences') {
        return jsonResponse({ name: 'Mariam', language: 'de', theme: 'dark' });
      }
      if (input.toString() === '/api/config') return jsonResponse({ podIp: 'x', namespace: 'x', appName: 'x', podName: 'x', nodeName: 'x', podStartTime: null, restartCount: 0 });
      if (input.toString() === '/api/session/status') return jsonResponse({ connected: true });
      return Promise.reject(new Error('Unexpected request'));
    });

    render(<App />);

    expect(await screen.findByText('Hallo, Mariam!')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('de');
    expect(document.querySelector('.app')).toHaveClass('dark');
  });

  it('saves changed profile preferences through the cookie-backed endpoint', async () => {
    const user = userEvent.setup();
    render(<App />);

    const nameInput = screen.getByLabelText('Your name');
    await user.type(nameInput, 'Sam');

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/preferences',
        expect.objectContaining({ method: 'PUT' })
      );
    });
  });
});
