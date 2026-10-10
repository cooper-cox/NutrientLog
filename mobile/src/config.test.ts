import { hostFromHostUri, resolveApiBaseUrl } from './config';

describe('hostFromHostUri', () => {
  it('takes the address out of the Expo dev server address', () => {
    expect(hostFromHostUri('192.168.1.5:8081')).toBe('192.168.1.5');
  });

  it('copes with a scheme and a path', () => {
    expect(hostFromHostUri('exp://192.168.1.5:8081')).toBe('192.168.1.5');
    expect(hostFromHostUri('exp://192.168.1.5:8081/--/some/path')).toBe('192.168.1.5');
  });

  it('works with host names', () => {
    expect(hostFromHostUri('my-macbook.local:8081')).toBe('my-macbook.local');
  });

  it('gives nothing for missing or empty values', () => {
    expect(hostFromHostUri(null)).toBeNull();
    expect(hostFromHostUri(undefined)).toBeNull();
    expect(hostFromHostUri('')).toBeNull();
    expect(hostFromHostUri(':8081')).toBeNull();
  });
});

describe('resolveApiBaseUrl', () => {
  it('uses the computer running the Expo dev server, on the backend port', () => {
    expect(resolveApiBaseUrl({ hostUri: '192.168.1.5:8081' })).toBe('http://192.168.1.5:8000');
  });

  it('prefers an explicit EXPO_PUBLIC_API_URL', () => {
    expect(
      resolveApiBaseUrl({ envUrl: 'http://10.0.0.9:9000', hostUri: '192.168.1.5:8081' }),
    ).toBe('http://10.0.0.9:9000');
  });

  it('removes trailing slashes and whitespace from the explicit address', () => {
    expect(resolveApiBaseUrl({ envUrl: '  https://api.example.com/// ' })).toBe(
      'https://api.example.com',
    );
  });

  it('ignores an empty explicit address', () => {
    expect(resolveApiBaseUrl({ envUrl: '   ', hostUri: '192.168.1.5:8081' })).toBe(
      'http://192.168.1.5:8000',
    );
  });

  it('falls back to localhost when nothing is known', () => {
    expect(resolveApiBaseUrl({})).toBe('http://localhost:8000');
  });
});
