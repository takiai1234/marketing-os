import { db } from '@/lib/db';
import {
  createBundleTeam,
  refreshBundleChannels,
  setBundleChannel,
} from './api-client';

interface TeamMemberRow {
  id: string;
  name: string;
  email: string;
  bundle_team_id: string | null;
}

function buildBundleTeamName(member: TeamMemberRow): string {
  const fallback = (member.email ?? '').trim() || `Team ${member.id.slice(0, 8)}`;
  const baseName = (member.name ?? '').trim() || fallback;
  const safeName = baseName.length >= 3 ? baseName : `Team ${baseName}`;
  return safeName.slice(0, 80);
}

export async function ensureBundleTeamForMember(userId: string): Promise<string> {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query<TeamMemberRow>(
      `SELECT id, name, email, bundle_team_id
       FROM team_member
       WHERE id = $1
       LIMIT 1
       FOR UPDATE`,
      [userId]
    );

    const member = result.rows[0];
    if (!member) {
      throw new Error('Team member not found');
    }

    if (member.bundle_team_id) {
      await client.query('COMMIT');
      return member.bundle_team_id;
    }

    // Keep a row lock until Bundle returns so two concurrent connects cannot
    // create two remote teams for the same local user.
    const team = await createBundleTeam({
      name: buildBundleTeamName(member),
    });

    const update = await client.query<{ bundle_team_id: string | null }>(
      `UPDATE team_member
       SET bundle_team_id = $2
       WHERE id = $1
       RETURNING bundle_team_id`,
      [userId, team.id]
    );

    const bundleTeamId = update.rows[0]?.bundle_team_id;
    if (!bundleTeamId) {
      throw new Error('Failed to persist Bundle team id');
    }

    await client.query('COMMIT');
    return bundleTeamId;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function syncFacebookChannelToBundle(input: {
  userId: string;
  pageId: string;
}): Promise<void> {
  const teamId = await ensureBundleTeamForMember(input.userId);

  await refreshBundleChannels({
    teamId,
    type: 'FACEBOOK',
  });

  await setBundleChannel({
    teamId,
    type: 'FACEBOOK',
    channelId: input.pageId,
  });
}
