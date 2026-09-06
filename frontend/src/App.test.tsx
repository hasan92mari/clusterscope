import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = input.toString();
        if (url === '/api/config') {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                podIp: '10.0.0.15',
                namespace: 'clusterscope',
                appName: 'clusterscope-frontend',
                podName: 'frontend-abc',
                nodeName: 'worker-node-a',
                podStartTime: null,
                restartCount: 2,
              }),
              {
                status: 200,
                headers: {
                  'Content-Type': 'application/json',
                },
              }
            )
          );
        }

        if (url === '/api/session/status') {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                connected: true,
              }),
              {
                status: 200,
                headers: {
                  'Content-Type': 'application/json',
                },
              }
            )
          );
        }

        return Promise.reject(
          new Error(`Unexpected fetch URL: ${url}`)
        );
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the ClusterScope application', async () => {
    render(<App />);

    expect(
      screen.getByText('ClusterScope')
    ).toBeInTheDocument();

    expect(
      screen.getByText('Kubernetes Environment Dashboard')
    ).toBeInTheDocument();

    expect(
      await screen.findByText('10.0.0.15')
    ).toBeInTheDocument();

    expect(
      screen.getByText('clusterscope')
    ).toBeInTheDocument();

    expect(
      screen.getByText('frontend-abc')
    ).toBeInTheDocument();

    expect(
      screen.getByText('worker-node-a')
    ).toBeInTheDocument();

    expect(
      screen.getByText('2')
    ).toBeInTheDocument();

    expect(
      screen.getByText('Connected')
    ).toBeInTheDocument();
  });
});


it('checks whether a name exists in Redis', async () => {
  const fetchMock = vi.mocked(fetch);

  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = input.toString();
    if (url === '/api/config') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            podIp: '10.0.0.15',
            namespace: 'clusterscope',
            appName: 'clusterscope-frontend',
            podName: 'frontend-abc',
            nodeName: 'worker-node-a',
            podStartTime: null,
            restartCount: 2,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      );
    }

    if (url === '/api/session/status') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            connected: true,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      );
    }

    if (url === '/api/session/test-user') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            connected: true,
            found: true,
            magicNumber: '42',
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      );
    }

    return Promise.reject(
      new Error(`Unexpected fetch URL: ${url}`)
    );
  });

  render(<App />);

  const nameInput =
    await screen.findByPlaceholderText('Enter name');

  const checkButton =
    screen.getByRole('button', {
      name: '✓',
    });

  await userEvent.type(nameInput, 'test-user');

  await userEvent.click(checkButton);

  expect(
    await screen.findByText(
      'Your magic number is:'
    )
  ).toBeInTheDocument();

  expect(
    screen.getByText('42')
  ).toBeInTheDocument();

  expect(fetchMock).toHaveBeenCalledWith(
    '/api/session/test-user',
    {
      cache: 'no-store',
    }
  );
});

it('shows that a name was not found in Redis', async () => {
  const fetchMock = vi.mocked(fetch);

  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = input.toString();
    if (url === '/api/config') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            podIp: '10.0.0.15',
            namespace: 'clusterscope',
            appName: 'clusterscope-frontend',
            podName: 'frontend-abc',
            nodeName: 'worker-node-a',
            podStartTime: null,
            restartCount: 2,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      );
    }

    if (url === '/api/session/status') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            connected: true,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      );
    }

    if (url === '/api/session/test-user') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            connected: true,
            found: false,
            magicNumber: null,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      );
    }

    return Promise.reject(
      new Error(`Unexpected fetch URL: ${url}`)
    );
  });

  const user = userEvent.setup();

  render(<App />);

  const nameInput =
    await screen.findByPlaceholderText('Enter name');

  await user.type(nameInput, 'test-user');

  await user.click(
    screen.getByRole('button', {
      name: '✓',
    })
  );

  expect(
    await screen.findByPlaceholderText('Enter magic number')
  ).toBeInTheDocument();

  expect(
    screen.getByRole('button', {
      name: 'Send',
    })
  ).toBeInTheDocument();

  expect(fetchMock).toHaveBeenCalledWith(
    '/api/session/test-user',
    {
      cache: 'no-store',
    }
  );
});

it('saves a magic number to Redis', async () => {
  const fetchMock = vi.mocked(fetch);

  fetchMock.mockImplementation((input: RequestInfo | URL, options?: RequestInit) => {
    const url = input.toString();
    if (url === '/api/config') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            podIp: '10.0.0.15',
            namespace: 'clusterscope',
            appName: 'clusterscope-frontend',
            podName: 'frontend-abc',
            nodeName: 'worker-node-a',
            podStartTime: null,
            restartCount: 2,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      );
    }

    if (url === '/api/session/status') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            connected: true,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      );
    }

    if (
      url === '/api/session/test-user' &&
      options?.method === undefined
    ) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            connected: true,
            found: false,
            magicNumber: null,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      );
    }

    if (
      url === '/api/session/test-user' &&
      options?.method === 'POST'
    ) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            connected: true,
            saved: true,
            magicNumber: '42',
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      );
    }

    return Promise.reject(
      new Error(`Unexpected fetch URL: ${url}`)
    );
  });

  const user = userEvent.setup();

  render(<App />);

  const nameInput =
    await screen.findByPlaceholderText('Enter name');

  await user.type(nameInput, 'test-user');

  await user.click(
    screen.getByRole('button', {
      name: '✓',
    })
  );

  const magicInput =
    await screen.findByPlaceholderText('Enter magic number');

  await user.type(magicInput, '42');

  await user.click(
    screen.getByRole('button', {
      name: 'Send',
    })
  );

  expect(
    await screen.findByText(
      '✓ Magic number updated successfully'
    )
  ).toBeInTheDocument();

  expect(
    screen.getByText('42')
  ).toBeInTheDocument();

  expect(fetchMock).toHaveBeenCalledWith(
    '/api/session/test-user',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        magicNumber: '42',
      }),
    }
  );
});

it('connects to the backend and displays backend status', async () => {
  const fetchMock = vi.mocked(fetch);

  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = input.toString();
    if (url === '/api/config') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            podIp: '10.0.0.15',
            namespace: 'clusterscope',
            appName: 'clusterscope-frontend',
            podName: 'frontend-abc',
            nodeName: 'worker-node-a',
            podStartTime: null,
            restartCount: 2,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      );
    }

    if (url === '/api/session/status') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            connected: true,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      );
    }

    if (url === '/api/backend/status') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            connected: true,
            data: {
              podIp: '10.0.0.20',
              namespace: 'clusterscope',
              appName: 'clusterscope-backend',
              podName: 'backend-abc',
              nodeName: 'worker-node-b',
              podStartTime: null,
              restartCount: 1,
            },
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      );
    }

    return Promise.reject(
      new Error(`Unexpected fetch URL: ${url}`)
    );
  });

  const user = userEvent.setup();

  render(<App />);

  await screen.findByText('10.0.0.15');

  await user.click(
    screen.getByRole('button', {
      name: 'Connect',
    })
  );

  expect(
    await screen.findByText('10.0.0.20')
  ).toBeInTheDocument();

  expect(
    screen.getByText('backend-abc')
  ).toBeInTheDocument();

  expect(
    screen.getByText('worker-node-b')
  ).toBeInTheDocument();

  expect(
    fetchMock
  ).toHaveBeenCalledWith(
    '/api/backend/status',
    {
      cache: 'no-store',
    }
  );
});

it('handles backend connection failure', async () => {
  const fetchMock = vi.mocked(fetch);

  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = input.toString();
    if (url === '/api/config') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            podIp: '10.0.0.15',
            namespace: 'clusterscope',
            appName: 'clusterscope-frontend',
            podName: 'frontend-abc',
            nodeName: 'worker-node-a',
            podStartTime: null,
            restartCount: 2,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      );
    }

    if (url === '/api/session/status') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            connected: true,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      );
    }

    if (url === '/api/backend/status') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            connected: false,
            data: null,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      );
    }

    return Promise.reject(
      new Error(`Unexpected fetch URL: ${url}`)
    );
  });

  const user = userEvent.setup();

  render(<App />);

  await screen.findByText('10.0.0.15');

  await user.click(
    screen.getByRole('button', {
      name: 'Connect',
    })
  );

  expect(
    await screen.findByText('Backend not found')
  ).toBeInTheDocument();

  expect(
    screen.queryByText('backend-abc')
  ).not.toBeInTheDocument();

  expect(
    fetchMock
  ).toHaveBeenCalledWith(
    '/api/backend/status',
    {
      cache: 'no-store',
    }
  );
});

it('loads the real magic value from PostgreSQL', async () => {
  const fetchMock = vi.mocked(fetch);

  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = input.toString();
    if (url === '/api/config') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            podIp: '10.0.0.15',
            namespace: 'clusterscope',
            appName: 'clusterscope-frontend',
            podName: 'frontend-abc',
            nodeName: 'worker-node-a',
            podStartTime: null,
            restartCount: 2,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      );
    }

    if (url === '/api/session/status') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            connected: true,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      );
    }

    if (url === '/api/backend/status') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            connected: true,
            data: {
              podIp: '10.0.0.20',
              namespace: 'clusterscope',
              appName: 'clusterscope-backend',
              podName: 'backend-abc',
              nodeName: 'worker-node-b',
              podStartTime: null,
              restartCount: 1,
            },
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      );
    }

    if (url.startsWith('/api/backend/magic/')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            magicValue: '12345',
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      );
    }

    return Promise.reject(
      new Error(`Unexpected fetch URL: ${url}`)
    );
  });

  const user = userEvent.setup();

  render(<App />);

  await screen.findByText('10.0.0.15');

  await user.click(
    screen.getByRole('button', {
      name: 'Connect',
    })
  );

  expect(
    await screen.findByText('10.0.0.20')
  ).toBeInTheDocument();

  const nameInput =
    screen.getByPlaceholderText('Enter name');

  await user.type(nameInput, 'test-user');

  expect(
  await screen.findByText(
      (_, element) =>
      element?.textContent?.replace(/\s+/g, ' ').trim() ===
      'Real magic value: 12345'
  )
  ).toBeInTheDocument();

  expect(fetchMock).toHaveBeenCalledWith(
    '/api/backend/magic/test-user',
    {
      cache: 'no-store',
    }
  );
});

it('shows when no real magic value exists in PostgreSQL', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url === '/api/config') {
      return new Response(
        JSON.stringify({
          podIp: '10.0.0.15',
          namespace: 'clusterscope',
          appName: 'clusterscope-frontend',
          podName: 'frontend-abc',
          nodeName: 'worker-node-a',
          podStartTime: null,
          restartCount: 2,
        }),
        { status: 200 }
      );
    }

    if (url === '/api/session/status') {
      return new Response(
        JSON.stringify({
          connected: true,
        }),
        { status: 200 }
      );
    }

    if (url === '/api/backend/status') {
      return new Response(
        JSON.stringify({
          connected: true,
          data: {
            podIp: '10.0.0.20',
            namespace: 'clusterscope',
            appName: 'clusterscope-backend',
            podName: 'backend-abc',
            nodeName: 'worker-node-b',
            podStartTime: null,
            restartCount: 1,
          },
        }),
        { status: 200 }
      );
    }

    if (url.startsWith('/api/backend/magic/')) {
      return new Response(
        JSON.stringify({
          error: 'Magic value not found',
        }),
        { status: 404 }
      );
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock);

  render(<App />);

  const nameInput = await screen.findByPlaceholderText('Enter name');

  await userEvent.type(nameInput, 'test-user');

  await userEvent.click(screen.getByRole('button', { name: 'Connect' }));

  const message = await screen.findByText(
    (_, element) => {
      if (!element) {
        return false;
      }

      return (
        element.classList.contains('backend-magic-message') &&
        element.textContent?.includes(
          'No real magic value found for'
        ) === true
      );
    }
  );

  expect(message).toHaveTextContent(
    'No real magic value found for test-user'
  );

  expect(
    screen.getByPlaceholderText('Enter real magic value')
  ).toBeInTheDocument();

  expect(
    screen.getByRole('button', { name: 'Save' })
  ).toBeInTheDocument();

  expect(fetchMock).toHaveBeenCalledWith(
    '/api/backend/magic/test-user',
    {
      cache: 'no-store',
    }
  );

  expect(
    screen.getByPlaceholderText('Enter real magic value')
  ).toBeInTheDocument();

  expect(
    screen.getByRole('button', { name: 'Save' })
  ).toBeInTheDocument();

  expect(fetchMock).toHaveBeenCalledWith(
    '/api/backend/magic/test-user',
    {
      cache: 'no-store',
    }
  );
});

it('saves a new real magic value to PostgreSQL', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    const url = input.toString();
    if (url === '/api/config') {
      return new Response(
        JSON.stringify({
          podIp: '10.0.0.15',
          namespace: 'clusterscope',
          appName: 'clusterscope-frontend',
          podName: 'frontend-abc',
          nodeName: 'worker-node-a',
          podStartTime: null,
          restartCount: 2,
        }),
        { status: 200 }
      );
    }

    if (url === '/api/session/status') {
      return new Response(
        JSON.stringify({
          connected: true,
        }),
        { status: 200 }
      );
    }

    if (url === '/api/backend/status') {
      return new Response(
        JSON.stringify({
          connected: true,
          data: {
            podIp: '10.0.0.20',
            namespace: 'clusterscope',
            appName: 'clusterscope-backend',
            podName: 'backend-abc',
            nodeName: 'worker-node-b',
            podStartTime: null,
            restartCount: 1,
          },
        }),
        { status: 200 }
      );
    }

    if (
      url.startsWith('/api/backend/magic/') &&
      options?.method === 'POST'
    ) {
      return new Response(
        JSON.stringify({
          magicValue: '67890',
        }),
        { status: 200 }
      );
    }

    if (url.startsWith('/api/backend/magic/')) {
      return new Response(
        JSON.stringify({
          error: 'Magic value not found',
        }),
        { status: 404 }
      );
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock);

  render(<App />);

  const nameInput = await screen.findByPlaceholderText('Enter name');

  await userEvent.type(nameInput, 'test-user');

  await userEvent.click(
    screen.getByRole('button', { name: 'Connect' })
  );

  const magicInput =
    await screen.findByPlaceholderText('Enter real magic value');

  await userEvent.type(magicInput, '67890');

  await userEvent.click(
    screen.getByRole('button', { name: 'Save' })
  );

  expect(
    await screen.findByText(
      '✓ Real magic value updated successfully'
    )
  ).toBeInTheDocument();

  expect(fetchMock).toHaveBeenCalledWith(
    '/api/backend/magic/test-user',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        magicValue: '67890',
      }),
    }
  );
});