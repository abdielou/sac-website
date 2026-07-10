// Group sync diff logic tests

import { computeGroupDiff, GROUP_MIEMBROS, GROUP_PERSONAL, SYNC_STATUSES } from '../lib/group-sync'

const member = (overrides) => ({
  email: 'personal@example.com',
  sacEmail: 'user@sociedadastronomia.com',
  name: 'Test User',
  status: 'active',
  ...overrides,
})

const emptyGroups = () => ({ [GROUP_MIEMBROS]: [], [GROUP_PERSONAL]: [] })

describe('constants', () => {
  it('exports the fixed group addresses and sync statuses', () => {
    expect(GROUP_MIEMBROS).toBe('miembros@sociedadastronomia.com')
    expect(GROUP_PERSONAL).toBe('members_personal@sociedadastronomia.com')
    expect(SYNC_STATUSES).toEqual(['active', 'expiring-soon'])
  })
})

describe('computeGroupDiff — adds', () => {
  it('proposes adding an active member missing from both groups', () => {
    const diff = computeGroupDiff([member({})], emptyGroups())
    expect(diff.groups[GROUP_MIEMBROS].toAdd).toEqual([
      { email: 'user@sociedadastronomia.com', name: 'Test User' },
    ])
    expect(diff.groups[GROUP_PERSONAL].toAdd).toEqual([
      { email: 'personal@example.com', name: 'Test User' },
    ])
    expect(diff.groups[GROUP_MIEMBROS].toRemove).toEqual([])
    expect(diff.groups[GROUP_PERSONAL].toRemove).toEqual([])
  })

  it('includes expiring-soon members as desired', () => {
    const diff = computeGroupDiff([member({ status: 'expiring-soon' })], emptyGroups())
    expect(diff.groups[GROUP_MIEMBROS].toAdd).toHaveLength(1)
    expect(diff.groups[GROUP_PERSONAL].toAdd).toHaveLength(1)
  })

  it('does not propose adding expired members', () => {
    const diff = computeGroupDiff([member({ status: 'expired' })], emptyGroups())
    expect(diff.groups[GROUP_MIEMBROS].toAdd).toEqual([])
    expect(diff.groups[GROUP_PERSONAL].toAdd).toEqual([])
  })

  it('does not propose an add when the member is already in the group (case/whitespace-insensitive)', () => {
    const diff = computeGroupDiff([member({})], {
      [GROUP_MIEMBROS]: [{ email: '  User@SociedadAstronomia.com ', role: 'MEMBER', type: 'USER' }],
      [GROUP_PERSONAL]: [{ email: 'PERSONAL@example.com', role: 'MEMBER', type: 'USER' }],
    })
    expect(diff.groups[GROUP_MIEMBROS].toAdd).toEqual([])
    expect(diff.groups[GROUP_PERSONAL].toAdd).toEqual([])
  })
})

describe('computeGroupDiff — removals', () => {
  it('proposes removing a group member whose membership expired, with reason and role', () => {
    const diff = computeGroupDiff([member({ status: 'expired' })], {
      [GROUP_MIEMBROS]: [{ email: 'user@sociedadastronomia.com', role: 'MEMBER', type: 'USER' }],
      [GROUP_PERSONAL]: [{ email: 'personal@example.com', role: 'MEMBER', type: 'USER' }],
    })
    expect(diff.groups[GROUP_MIEMBROS].toRemove).toEqual([
      { email: 'user@sociedadastronomia.com', reason: 'expired', role: 'MEMBER' },
    ])
    expect(diff.groups[GROUP_PERSONAL].toRemove).toEqual([
      { email: 'personal@example.com', reason: 'expired', role: 'MEMBER' },
    ])
  })

  it('flags addresses matching no member row as unknown, preserving role', () => {
    const diff = computeGroupDiff([member({})], {
      [GROUP_MIEMBROS]: [
        { email: 'user@sociedadastronomia.com', role: 'MEMBER', type: 'USER' },
        { email: 'presidente@sociedadastronomia.com', role: 'OWNER', type: 'USER' },
      ],
      [GROUP_PERSONAL]: [{ email: 'personal@example.com', role: 'MEMBER', type: 'USER' }],
    })
    expect(diff.groups[GROUP_MIEMBROS].toRemove).toEqual([
      { email: 'presidente@sociedadastronomia.com', reason: 'unknown', role: 'OWNER' },
    ])
  })

  it("recognizes a member's sac email in the personal group (cross-email match) with their status as reason", () => {
    // Expired member's SAC address sits in the personal group: not desired there,
    // but the reason should be their status, not 'unknown'.
    const diff = computeGroupDiff([member({ status: 'expired' })], {
      [GROUP_MIEMBROS]: [],
      [GROUP_PERSONAL]: [{ email: 'user@sociedadastronomia.com', role: 'MEMBER', type: 'USER' }],
    })
    expect(diff.groups[GROUP_PERSONAL].toRemove).toEqual([
      { email: 'user@sociedadastronomia.com', reason: 'expired', role: 'MEMBER' },
    ])
  })
})

describe('computeGroupDiff — missing sacEmail', () => {
  it('reports active members without a workspace account and does not add them to miembros@', () => {
    const diff = computeGroupDiff([member({ sacEmail: null })], emptyGroups())
    expect(diff.missingSacEmail).toEqual([{ email: 'personal@example.com', name: 'Test User' }])
    expect(diff.groups[GROUP_MIEMBROS].toAdd).toEqual([])
    expect(diff.groups[GROUP_PERSONAL].toAdd).toHaveLength(1)
  })

  it('does not report non-active members without sacEmail', () => {
    const diff = computeGroupDiff([member({ sacEmail: '', status: 'expired' })], emptyGroups())
    expect(diff.missingSacEmail).toEqual([])
  })
})

describe('computeGroupDiff — already in sync', () => {
  it('returns empty diffs when groups match the roster', () => {
    const diff = computeGroupDiff([member({})], {
      [GROUP_MIEMBROS]: [{ email: 'user@sociedadastronomia.com', role: 'MEMBER', type: 'USER' }],
      [GROUP_PERSONAL]: [{ email: 'personal@example.com', role: 'MEMBER', type: 'USER' }],
    })
    expect(diff.groups[GROUP_MIEMBROS].toAdd).toEqual([])
    expect(diff.groups[GROUP_MIEMBROS].toRemove).toEqual([])
    expect(diff.groups[GROUP_PERSONAL].toAdd).toEqual([])
    expect(diff.groups[GROUP_PERSONAL].toRemove).toEqual([])
    expect(diff.missingSacEmail).toEqual([])
  })

  it('handles missing group listings gracefully (treated as empty)', () => {
    const diff = computeGroupDiff([member({})], {})
    expect(diff.groups[GROUP_MIEMBROS].toAdd).toHaveLength(1)
    expect(diff.groups[GROUP_PERSONAL].toAdd).toHaveLength(1)
  })
})
