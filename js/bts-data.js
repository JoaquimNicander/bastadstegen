/* =====================================================================
 *  BTS Stegen — data-lager (brygga mot Supabase)
 *
 *  Ersätter localStorage med en delad databas. Inkludera SÅHÄR i HTML,
 *  FÖRE övriga skript:
 *
 *    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *    <script src="js/bts-data.js"></script>
 *
 *  Sen anropar sidorna window.BTS.* (alla funktioner är async).
 *  Nästa steg: byt ut localStorage-anropen i stegen/rapportera/admin
 *  mot dessa funktioner.
 * ===================================================================== */

// ── 1. KONFIG — fyll i från Supabase (Project Settings → API) ──────────
const SUPABASE_URL      = 'https://fueggdqtgmvldjbhcdfn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_vZCnLnp41c29DFN7MLpYsQ_AUBnxJPy';  // publishable (browser-säker)

// ── 2. Klient ──────────────────────────────────────────────────────────
const _sb = (window.supabase && SUPABASE_URL !== 'DIN_PROJECT_URL')
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

function _assert() {
  if (!_sb) throw new Error('Supabase ej konfigurerad — fyll i URL och nyckel i js/bts-data.js');
}

const BTS = {
  ready() { return !!_sb; },

  // ── SPELARE ──────────────────────────────────────────────────────────
  async getPlayers() {
    _assert();
    // OBS: läser INTE pin-kolumnen (dold av säkerhetsskäl)
    const { data, error } = await _sb.from('players')
      .select('id,name,phone,born,photo_url,is_admin,active').order('name');
    if (error) throw error;
    return data;
  },

  // Verifiera spelarens PIN (server-side, exponerar inte koden)
  async verifyPin(playerId, pin) {
    _assert();
    const { data, error } = await _sb.rpc('bts_check_pin', { p_player_id: playerId, p_pin: pin });
    if (error) throw error;
    return data === true;
  },

  // Byt PIN (kräver gamla)
  async setPin(playerId, oldPin, newPin) {
    _assert();
    const { data, error } = await _sb.rpc('bts_set_pin', { p_player_id: playerId, p_old_pin: oldPin, p_new_pin: newPin });
    if (error) throw error;
    return data === true;
  },

  // ── TÄVLINGAR (stegar/säsonger) ──────────────────────────────────────
  async getCompetitions() {
    _assert();
    const { data, error } = await _sb.from('competitions').select('*').order('start_date');
    if (error) throw error;
    return data;
  },

  async getActiveCompetition() {
    _assert();
    const today = new Date().toISOString().slice(0, 10);
    const comps = await this.getCompetitions();
    return comps.find(c => c.active)
        || comps.find(c => c.start_date <= today && today <= c.end_date)
        || comps[comps.length - 1];
  },

  // ── STEGE (ordnad lista) ──────────────────────────────────────────────
  // Returnerar [{ position, player_id, player: {id,name,...} }, ...]
  async getLadder(competitionId) {
    _assert();
    const { data, error } = await _sb
      .from('ladder_positions')
      .select('position, player_id, player:players(id,name,phone,born,photo_url,is_admin,active)')
      .eq('competition_id', competitionId)
      .order('position');
    if (error) throw error;
    return data;
  },

  // ── MATCHER ───────────────────────────────────────────────────────────
  async getMatches(competitionId, round) {
    _assert();
    let q = _sb.from('matches').select('*').eq('competition_id', competitionId);
    if (round != null) q = q.eq('round', round);
    const { data, error } = await q.order('pos_a', { nullsFirst: false });
    if (error) throw error;
    return data;
  },

  // En spelare rapporterar ett resultat → status 'reported'.
  // Motståndaren bekräftar sedan via confirmMatch().
  async reportMatch({ competitionId, round, playerAId, playerBId, posA, posB,
                      winnerId, sets = [], wo = false, score, reporterId, playDate }) {
    _assert();
    const row = {
      competition_id: competitionId, round,
      player_a_id: playerAId, player_b_id: playerBId,
      pos_a: posA ?? null, pos_b: posB ?? null,
      winner_id: winnerId, sets, wo,
      score: score ?? (wo ? 'WO' : sets.map(s => `${s.a}-${s.b}`).join(' ')),
      status: 'reported', reporter_id: reporterId, play_date: playDate ?? null,
    };
    // Uppdatera om matchen redan finns (samma tävling/omgång/spelare), annars skapa.
    const { data, error } = await _sb.from('matches').insert(row).select().single();
    if (error) throw error;
    return data;
  },

  // Rapportera resultat på en befintlig match (PIN-skyddat serveranrop).
  async reportResult(matchId, { playerId, pin, winnerId, sets = [], wo = false, score }) {
    _assert();
    const { error } = await _sb.rpc('bts_report_result', {
      p_match_id: matchId, p_player_id: playerId, p_pin: pin,
      p_winner_id: winnerId, p_sets: sets, p_wo: wo,
      p_score: score ?? (wo ? 'WO' : sets.map(s => `${s.a}-${s.b}`).join(' ')),
    });
    if (error) throw error;
  },

  // Ångra en rapport → tillbaka till 'scheduled' (PIN-skyddat).
  async unreportMatch(matchId, { playerId, pin }) {
    _assert();
    const { error } = await _sb.rpc('bts_unreport', { p_match_id: matchId, p_player_id: playerId, p_pin: pin });
    if (error) throw error;
  },

  // Motståndaren bekräftar (true) eller bestrider (false) (PIN-skyddat).
  async confirmMatch(matchId, { playerId, pin, agree }) {
    _assert();
    const { error } = await _sb.rpc('bts_confirm_match', {
      p_match_id: matchId, p_player_id: playerId, p_pin: pin, p_agree: agree,
    });
    if (error) throw error;
  },

  // ── ADMIN (lösenordsskyddat) ──────────────────────────────────────
  async adminSaveResult(adminPw, { matchId = null, competitionId, round, posA, posB,
                                   playerAId, playerBId, winnerId, sets = [], wo = false, score }) {
    _assert();
    const { data, error } = await _sb.rpc('bts_admin_save_result', {
      p_admin_pw: adminPw, p_match_id: matchId, p_comp: competitionId, p_round: round,
      p_pos_a: posA ?? null, p_pos_b: posB ?? null, p_player_a: playerAId ?? null, p_player_b: playerBId ?? null,
      p_winner_id: winnerId, p_sets: sets, p_wo: wo,
      p_score: score ?? (wo ? 'WO' : sets.map(s => `${s.a}-${s.b}`).join(' ')),
    });
    if (error) throw error;
    return data;
  },

  async adminPublishRound(adminPw, competitionId, round) {
    _assert();
    const { error } = await _sb.rpc('bts_admin_publish_round', {
      p_admin_pw: adminPw, p_comp: competitionId, p_round: round,
    });
    if (error) throw error;
  },

  // ── SOMMARSTEGE: veckoanmälan ─────────────────────────────────────────
  async getSignups(competitionId, playDate) {
    _assert();
    const { data, error } = await _sb.from('dropin_signups')
      .select('*, player:players(id,name,phone,born,photo_url,is_admin,active)')
      .eq('competition_id', competitionId).eq('play_date', playDate);
    if (error) throw error;
    return data;
  },

  async addSignup(competitionId, playDate, playerId) {
    _assert();
    const { data, error } = await _sb.from('dropin_signups')
      .insert({ competition_id: competitionId, play_date: playDate, player_id: playerId })
      .select().single();
    if (error) throw error;
    return data;
  },

  async removeSignup(competitionId, playDate, playerId) {
    _assert();
    const { error } = await _sb.from('dropin_signups').delete()
      .eq('competition_id', competitionId).eq('play_date', playDate).eq('player_id', playerId);
    if (error) throw error;
  },

  // ── ADMIN: publicera omgång (flyttar stegen) ──────────────────────────
  // OBS: kräver admin-behörighet. Under nuvarande RLS skrivs inte
  // ladder_positions/competitions med anon-nyckeln — detta aktiveras när
  // vi satt upp inloggning imorgon. Logiken (grannpars-byte) bevaras här.
  async publishRound(competitionId, round) {
    _assert();
    const ladder  = await this.getLadder(competitionId);
    const matches = await this.getMatches(competitionId, round);
    const order = ladder.map(l => l.player_id);             // index 0 = position 1
    matches.forEach(m => {
      if (m.status !== 'confirmed' && m.status !== 'published') return;
      if (m.winner_id === m.player_b_id && m.pos_a && m.pos_b) {
        [order[m.pos_a - 1], order[m.pos_b - 1]] = [order[m.pos_b - 1], order[m.pos_a - 1]];
      }
    });
    // Skriv nya positioner
    const updates = order.map((pid, i) => ({ competition_id: competitionId, player_id: pid, position: i + 1 }));
    const { error: e1 } = await _sb.from('ladder_positions').upsert(updates);
    if (e1) throw e1;
    await _sb.from('matches').update({ status: 'published' })
      .eq('competition_id', competitionId).eq('round', round).eq('status', 'confirmed');
    const { error: e2 } = await _sb.from('competitions')
      .update({ current_round: round + 1 }).eq('id', competitionId);
    if (e2) throw e2;
  },
};

window.BTS = BTS;
