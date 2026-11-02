const { parseGitSource, IGNORED_DIRS } = require('../../server/services/gitService');

describe('gitService parseGitSource', () => {
  test('parses standard git URL without branch', () => {
    const parsed = parseGitSource('https://github.com/BBBB0601/PolyAR.git');
    expect(parsed.cloneUrl).toBe('https://github.com/BBBB0601/PolyAR.git');
    expect(parsed.branch).toBeNull();
    expect(parsed.repoName).toBe('PolyAR');
  });

  test('parses GitHub tree branch URL', () => {
    const parsed = parseGitSource('https://github.com/BBBB0601/PolyAR/tree/dev');
    expect(parsed.cloneUrl).toBe('https://github.com/BBBB0601/PolyAR.git');
    expect(parsed.branch).toBe('dev');
    expect(parsed.repoName).toBe('PolyAR');
  });

  test('parses nested branch name with slashes', () => {
    const parsed = parseGitSource('https://github.com/user/project/tree/feature/quick-fix');
    expect(parsed.cloneUrl).toBe('https://github.com/user/project.git');
    expect(parsed.branch).toBe('feature/quick-fix');
    expect(parsed.repoName).toBe('project');
  });

  test('parses GitLab tree branch URL', () => {
    const parsed = parseGitSource('https://gitlab.com/team/subteam/my-service/-/tree/release-v1');
    expect(parsed.cloneUrl).toBe('https://gitlab.com/team/subteam/my-service.git');
    expect(parsed.branch).toBe('release-v1');
    expect(parsed.repoName).toBe('my-service');
  });

  test('contains Unity and build ignored directories', () => {
    expect(IGNORED_DIRS.has('Library')).toBe(true);
    expect(IGNORED_DIRS.has('Temp')).toBe(true);
    expect(IGNORED_DIRS.has('Logs')).toBe(true);
    expect(IGNORED_DIRS.has('node_modules')).toBe(true);
    expect(IGNORED_DIRS.has('obj')).toBe(true);
  });
});
