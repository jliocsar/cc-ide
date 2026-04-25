import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock electron before importing agent-map (agent-map → event-bus → electron).
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }))

const broadcastMock = vi.fn()
vi.mock('../event-bus', () => ({
  broadcast: (channel: string, payload: unknown) => broadcastMock(channel, payload),
}))

import {
  __clearForTests,
  extractTeammateInfoFromCmdline,
  getSessionByCcIdeWindow,
  getSessionBySessionId,
  onSessionStart,
  onSubagentStart,
  onSubagentStop,
} from './agent-map'

beforeEach(() => {
  __clearForTests()
  broadcastMock.mockClear()
})

afterEach(() => {
  __clearForTests()
})

describe('agent-map', () => {
  describe('extractTeammateInfoFromCmdline', () => {
    it('1. parses teammate spawn cmdline (space-separated)', () => {
      const cmd =
        '/path/to/claude --agent-id alpha@team --agent-name alpha --team-name team --agent-color blue --parent-session-id 18b4722e-0b3d-4ca9-a4a1-d2f31f4bcf89 --agent-type general-purpose'
      const info = extractTeammateInfoFromCmdline(cmd)
      expect(info).toEqual({
        parentSessionId: '18b4722e-0b3d-4ca9-a4a1-d2f31f4bcf89',
        teamName: 'team',
        agentName: 'alpha',
        agentColor: 'blue',
        agentType: 'general-purpose',
      })
    })

    it('2. parses `--flag=value` form', () => {
      const cmd =
        '/path/claude --agent-name=beta --team-name=debug --parent-session-id=abc123 --agent-type=general-purpose'
      const info = extractTeammateInfoFromCmdline(cmd)
      expect(info?.agentName).toBe('beta')
      expect(info?.teamName).toBe('debug')
      expect(info?.parentSessionId).toBe('abc123')
    })

    it('3. returns null for non-teammate cmdline', () => {
      expect(extractTeammateInfoFromCmdline('/bin/claude --help')).toBeNull()
      expect(extractTeammateInfoFromCmdline('')).toBeNull()
    })

    it('4. handles flags with no value (flag at end of cmdline)', () => {
      const cmd = '/claude --parent-session-id abc --agent-name'
      const info = extractTeammateInfoFromCmdline(cmd)
      expect(info?.parentSessionId).toBe('abc')
      expect(info?.agentName).toBeUndefined()
    })

    it('5. does not consume another flag as a value', () => {
      const cmd = '/claude --parent-session-id abc --agent-name --team-name t'
      const info = extractTeammateInfoFromCmdline(cmd)
      expect(info?.agentName).toBeUndefined()
      expect(info?.teamName).toBe('t')
    })
  })

  describe('onSessionStart', () => {
    it('6. records an IDE-spawned session with CC_IDE_WINDOW', () => {
      onSessionStart({
        session_id: 'sess-1',
        cc_ide_window: 'claude-oreo',
        cwd: '/repo',
        transcript_path: '/tx.jsonl',
      })
      const entry = getSessionBySessionId('sess-1')
      expect(entry?.ccIdeWindow).toBe('claude-oreo')
      expect(entry?.cwd).toBe('/repo')
      expect(entry?.teammate).toBeUndefined()

      expect(getSessionByCcIdeWindow('claude-oreo')?.sessionId).toBe('sess-1')
    })

    it('7. detects a teammate via ppid cmdline and links to parent window', () => {
      onSessionStart({ session_id: 'leader', cc_ide_window: 'claude-leader' })
      onSessionStart({
        session_id: 'alpha',
        cwd: '/repo',
        agent_type: 'general-purpose',
        tmux_pane: '%22',
        tmux_socket: '/tmp/tmux-1000/default',
        ppid_cmdline:
          '/claude --agent-name alpha --team-name debug --agent-color blue --parent-session-id leader --agent-type general-purpose',
      })
      const entry = getSessionBySessionId('alpha')
      expect(entry?.teammate).toMatchObject({
        parentSessionId: 'leader',
        agentName: 'alpha',
        teamName: 'debug',
        agentColor: 'blue',
        agentType: 'general-purpose',
        tmuxPane: '%22',
        tmuxSocket: '/tmp/tmux-1000/default',
      })
    })

    it('8. re-entry preserves known ccIdeWindow when later SessionStart omits it', () => {
      onSessionStart({ session_id: 'sess-1', cc_ide_window: 'claude-oreo' })
      onSessionStart({ session_id: 'sess-1', cwd: '/new' })
      const entry = getSessionBySessionId('sess-1')
      expect(entry?.ccIdeWindow).toBe('claude-oreo')
      expect(entry?.cwd).toBe('/new')
    })

    it('8a. broadcasts agent:claudeSessionStarted for top-level claude with CC_IDE_WINDOW', () => {
      onSessionStart({ session_id: 'sess-1', cc_ide_window: 'claude-oreo' })
      const calls = broadcastMock.mock.calls.filter((c) => c[0] === 'agent:claudeSessionStarted')
      expect(calls).toHaveLength(1)
      expect(calls[0][1]).toEqual({ ccIdeWindow: 'claude-oreo', sessionId: 'sess-1' })
    })

    it('8b. does not broadcast claudeSessionStarted for teammate sessions', () => {
      onSessionStart({ session_id: 'leader', cc_ide_window: 'claude-leader' })
      broadcastMock.mockClear()
      onSessionStart({
        session_id: 'alpha',
        ppid_cmdline: '/claude --parent-session-id leader --agent-name alpha',
      })
      const claudeStartedCalls = broadcastMock.mock.calls.filter(
        (c) => c[0] === 'agent:claudeSessionStarted',
      )
      expect(claudeStartedCalls).toHaveLength(0)
    })

    it('8c. does not broadcast claudeSessionStarted when cc_ide_window is absent', () => {
      onSessionStart({ session_id: 'sess-1' })
      const calls = broadcastMock.mock.calls.filter((c) => c[0] === 'agent:claudeSessionStarted')
      expect(calls).toHaveLength(0)
    })
  })

  describe('onSubagentStart / onSubagentStop', () => {
    it('9. ignores subagent events for unknown parent session', () => {
      // no parent registered → nothing should happen / throw
      expect(() => onSubagentStart({ session_id: 'unknown', agent_id: 'a1' })).not.toThrow()
      expect(() => onSubagentStop({ session_id: 'unknown', agent_id: 'a1' })).not.toThrow()
    })

    it('10. accepts subagent events when parent is an IDE-owned Claude', () => {
      onSessionStart({ session_id: 'p1', cc_ide_window: 'claude-x' })
      expect(() =>
        onSubagentStart({ session_id: 'p1', agent_id: 'a1', agent_type: 'Explore' }),
      ).not.toThrow()
    })

    it('11. accepts subagent events when parent is a known teammate', () => {
      onSessionStart({ session_id: 'leader', cc_ide_window: 'claude-leader' })
      onSessionStart({
        session_id: 'alpha',
        ppid_cmdline: '/claude --parent-session-id leader --agent-name alpha',
      })
      expect(() => onSubagentStart({ session_id: 'alpha', agent_id: 'a1' })).not.toThrow()
    })
  })
})
