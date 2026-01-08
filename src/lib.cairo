use starknet::contract_address::ContractAddress;
use starknet::storage::Map;
use starknet::get_caller_address;

#[derive(Copy, Drop, Serde, starknet::Store)]
struct Entry {
    player: ContractAddress,
    points: u64,
    time_sec: u32,
    moves: u16,
}

#[starknet::contract]
mod solitaire_v1 {
    use super::{Entry};
    use starknet::class_hash::ClassHash;
    use starknet::contract_address::ContractAddress;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::get_caller_address;
    use starknet::syscalls::replace_class_syscall;
    use core::panic_with_felt252;

    // ========= Storage =========
    #[storage]
    struct Storage {
        owner: ContractAddress,
        version: u16,
        paused: bool,
        epoch: u16,

        daily_seed: Map<u32, u64>, // day(YYYYMMDD)->seed

        best_points: Map<(u16, ContractAddress, u32), u64>,
        best_all_time: Map<(u16, ContractAddress), u64>,
        points_total: Map<(u16, ContractAddress), u64>,
        points_by_day: Map<(u16, ContractAddress, u32), u64>,

        streak: Map<(u16, ContractAddress), u16>,
        last_day_played: Map<(u16, ContractAddress), u32>,

        leaderboard: Map<(u16, u32, u8), Entry>, // (epoch, day, idx)->Entry
        leaderboard_len: Map<(u16, u32), u8>,    // (epoch, day)->len (0..10)
        leaderboard_alltime: Map<(u16, u8), Entry>, // (epoch, idx)->Entry
        leaderboard_alltime_len: Map<u16, u8>,      // (epoch)->len (0..10)

        achievements: Map<ContractAddress, u256>, // future
        commits: Map<(ContractAddress, u32), felt252>, // future

        reserved_u64_0: u64,
        reserved_u64_1: u64,
    }

    // ========= Events =========
    #[event]
    fn ResultSubmitted(
        player: ContractAddress,
        day: u32,
        new_points: u64,
        delta: u64,
        total_points: u64,
        time_sec: u32,
        moves: u16,
    ) {}

    #[event]
    fn LeaderboardUpdated(day: u32, idx: u8, player: ContractAddress, points: u64) {}

    // ========= Constructor =========
    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        self.owner.write(owner);
        self.version.write(2);
        self.paused.write(false);
        self.epoch.write(0_u16);
        self.reserved_u64_0.write(0);
        self.reserved_u64_1.write(0);
    }

    // ========= Auth =========
    fn only_owner(self: @ContractState) {
        let caller = get_caller_address();
        let owner = self.owner.read();
        assert(caller == owner, 'NOT_OWNER');
    }

    // ========= Admin =========
    #[external(v0)]
    fn set_owner(ref self: ContractState, new_owner: ContractAddress) {
        only_owner(@self);
        self.owner.write(new_owner);
    }

    #[external(v0)]
    fn set_paused(ref self: ContractState, paused: bool) {
        only_owner(@self);
        self.paused.write(paused);
    }

    #[external(v0)]
    fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
        only_owner(@self);
        match replace_class_syscall(new_class_hash) {
            Result::Ok(()) => (),
            Result::Err(_) => panic_with_felt252('UPGRADE_FAILED'),
        }
    }

    #[external(v0)]
    fn reset_scores(ref self: ContractState) {
        only_owner(@self);
        let epoch = self.epoch.read();
        self.epoch.write(epoch + 1_u16);
        self.paused.write(false);
    }

    #[external(v0)]
    fn set_daily_seed(ref self: ContractState, day: u32, seed: u64) {
        only_owner(@self);
        self.daily_seed.write(day, seed);
    }

    #[external(v0)]
    fn get_daily_seed(self: @ContractState, day: u32) -> u64 {
        self.daily_seed.read(day)
    }

    #[external(v0)]
    fn get_epoch(self: @ContractState) -> u16 {
        self.epoch.read()
    }

    #[external(v0)]
    fn is_paused(self: @ContractState) -> bool {
        self.paused.read()
    }

    // ========= Views =========
    #[external(v0)]
    fn get_my_best(self: @ContractState, player: ContractAddress, day: u32) -> u64 {
        let epoch = self.epoch.read();
        self.best_points.read((epoch, player, day))
    }

    #[external(v0)]
    fn get_my_total(self: @ContractState, player: ContractAddress) -> u64 {
        let epoch = self.epoch.read();
        self.points_total.read((epoch, player))
    }

    #[external(v0)]
    fn get_leaderboard_len(self: @ContractState, day: u32) -> u8 {
        let epoch = self.epoch.read();
        self.leaderboard_len.read((epoch, day))
    }

    #[external(v0)]
    fn get_top_entry(self: @ContractState, day: u32, idx: u8) -> Entry {
        // caller should ensure idx < 10
        let epoch = self.epoch.read();
        self.leaderboard.read((epoch, day, idx))
    }

    #[external(v0)]
    fn get_alltime_len(self: @ContractState) -> u8 {
        let epoch = self.epoch.read();
        self.leaderboard_alltime_len.read(epoch)
    }

    #[external(v0)]
    fn get_alltime_top_entry(self: @ContractState, idx: u8) -> Entry {
        // caller should ensure idx < 10
        let epoch = self.epoch.read();
        self.leaderboard_alltime.read((epoch, idx))
    }

    // ========= Points formula (V1) =========
    fn calc_points(time_sec: u32, moves: u16, streak: u16) -> u64 {
        // Tunables
        let base: u64 = 10_000;
        let max_time_bonus: u64 = 6_000;
        let time_penalty_per_sec: u64 = 2;     // -2 per second
        let max_move_bonus: u64 = 4_000;
        let move_penalty_per_move: u64 = 10;   // -10 per move

        // Clamp inputs (basic anti-garbage)
        assert(time_sec > 0_u32, 'BAD_TIME');
        assert(time_sec <= 86_400_u32, 'TIME_TOO_BIG');
        assert(moves > 0_u16, 'BAD_MOVES');
        assert(moves <= 500_u16, 'MOVES_TOO_BIG');

        // time bonus
        let t: u64 = time_sec.into();
        let time_penalty = t * time_penalty_per_sec;
        let tb2 = if time_penalty >= max_time_bonus { 0_u64 } else { max_time_bonus - time_penalty };

        // move bonus
        let m: u64 = moves.into();
        let move_penalty = m * move_penalty_per_move;
        let mb2 = if move_penalty >= max_move_bonus { 0_u64 } else { max_move_bonus - move_penalty };

        // streak multiplier: 100% + min(streak,10)*5%
        let s = if streak > 10_u16 { 10_u16 } else { streak };
        let s_u64: u64 = s.into();
        let mult: u64 = 100 + s_u64 * 5;

        let sum: u64 = base + tb2 + mb2;
        (sum * mult) / 100
    }

    // ========= Streak update =========
    fn update_streak(ref self: ContractState, player: ContractAddress, day: u32) -> u16 {
        let epoch = self.epoch.read();
        let last = self.last_day_played.read((epoch, player));
        let cur = self.streak.read((epoch, player));

        // V1: "連続"判定は offchain で day を連番管理するのが理想。
        // ここでは簡易：前回と違うdayなら streak を更新（連続判定はUI側で day-1 を渡す設計にするのがベター）
        // 最初は「同日再提出はstreak変えない」「別日なら +1」程度でOK。

        if last == day {
            return cur;
        }

        // NOTE: 連続判定を厳密にするなら
        // - day を unix_day にする、または
        // - YYYYMMDD を day-1 で扱えるようにユーティリティを導入する
        // V1では「別日なら +1」「初回なら1」「飛んだら1」にするのが現実的。
        let new_streak = if last == 0_u32 { 1_u16 } else { cur + 1_u16 };
        self.streak.write((epoch, player), new_streak);
        self.last_day_played.write((epoch, player), day);
        new_streak
    }

    // ========= Leaderboard compare (tie-break) =========
    fn better_than(a: Entry, b: Entry) -> bool {
        // higher points wins
        if a.points != b.points {
            return a.points > b.points;
        }
        // lower time wins
        if a.time_sec != b.time_sec {
            return a.time_sec < b.time_sec;
        }
        // lower moves wins
        if a.moves != b.moves {
            return a.moves < b.moves;
        }
        // if totally equal, keep existing (stable)
        false
    }

    // Insert into Top10 (Map(day, idx)). Assumes caller already has updated player's new_points.
    fn upsert_top10(ref self: ContractState, epoch: u16, day: u32, entry: Entry) {
        // Determine current length
        let mut len = self.leaderboard_len.read((epoch, day));
        if len > 10_u8 { len = 10_u8; }

        // If player already exists in top list, remove it first (so one player occupies one slot)
        // Simple linear scan, shift left.
        let mut i: u8 = 0_u8;
        let mut found: bool = false;
        while i < len {
            let cur = self.leaderboard.read((epoch, day, i));
            if cur.player == entry.player {
                found = true;
                // shift left from i+1..len-1
                let mut j = i;
                while j + 1_u8 < len {
                    let nxt = self.leaderboard.read((epoch, day, j + 1_u8));
                    self.leaderboard.write((epoch, day, j), nxt);
                    j = j + 1_u8;
                }
                // len decreases by 1
                len = len - 1_u8;
                break;
            }
            i = i + 1_u8;
        }

        // Find insert position
        let mut pos: u8 = 0_u8;
        let mut inserted: bool = false;

        while pos < len {
            let cur = self.leaderboard.read((epoch, day, pos));
            if better_than(entry, cur) {
                // shift right to make room (up to 9)
                let mut k = if len < 10_u8 { len } else { 9_u8 };
                // shift from k-1 down to pos
                while k > pos {
                    let prev = self.leaderboard.read((epoch, day, k - 1_u8));
                    self.leaderboard.write((epoch, day, k), prev);
                    k = k - 1_u8;
                }
                self.leaderboard.write((epoch, day, pos), entry);
                inserted = true;
                break;
            }
            pos = pos + 1_u8;
        }

        if !inserted {
            if len < 10_u8 {
                // append
                self.leaderboard.write((epoch, day, len), entry);
                inserted = true;
                pos = len;
            } else {
                // not good enough for top10
                return;
            }
        }

        // Update len (cap at 10)
        let new_len = if len < 10_u8 { len + 1_u8 } else { 10_u8 };
        self.leaderboard_len.write((epoch, day), new_len);

        // Optional event
        LeaderboardUpdated(day, pos, entry.player, entry.points);
    }

    fn upsert_top10_alltime(ref self: ContractState, epoch: u16, entry: Entry) {
        // Determine current length
        let mut len = self.leaderboard_alltime_len.read(epoch);
        if len > 10_u8 { len = 10_u8; }

        // Remove existing entry for the player if present
        let mut i: u8 = 0_u8;
        while i < len {
            let cur = self.leaderboard_alltime.read((epoch, i));
            if cur.player == entry.player {
                let mut j = i;
                while j + 1_u8 < len {
                    let nxt = self.leaderboard_alltime.read((epoch, j + 1_u8));
                    self.leaderboard_alltime.write((epoch, j), nxt);
                    j = j + 1_u8;
                }
                len = len - 1_u8;
                break;
            }
            i = i + 1_u8;
        }

        // Find insert position
        let mut pos: u8 = 0_u8;
        let mut inserted: bool = false;
        while pos < len {
            let cur = self.leaderboard_alltime.read((epoch, pos));
            if better_than(entry, cur) {
                let mut k = if len < 10_u8 { len } else { 9_u8 };
                while k > pos {
                    let prev = self.leaderboard_alltime.read((epoch, k - 1_u8));
                    self.leaderboard_alltime.write((epoch, k), prev);
                    k = k - 1_u8;
                }
                self.leaderboard_alltime.write((epoch, pos), entry);
                inserted = true;
                break;
            }
            pos = pos + 1_u8;
        }

        if !inserted {
            if len < 10_u8 {
                self.leaderboard_alltime.write((epoch, len), entry);
                inserted = true;
                pos = len;
            } else {
                return;
            }
        }

        let new_len = if len < 10_u8 { len + 1_u8 } else { 10_u8 };
        self.leaderboard_alltime_len.write(epoch, new_len);
    }

    // ========= Main submit (B: delta only) =========
    #[external(v0)]
    fn submit_result(ref self: ContractState, day: u32, time_sec: u32, moves: u16) {
        let player = get_caller_address();
        let paused = self.paused.read();
        assert(paused == false, 'PAUSED');
        let epoch = self.epoch.read();

        // update streak first (affects points)
        let s = update_streak(ref self, player, day);

        // compute points
        let new_points = calc_points(time_sec, moves, s);

        // read old best
        let old_best = self.best_points.read((epoch, player, day));
        if new_points <= old_best {
            // no update, no delta
            // (You can still emit ResultSubmitted with delta=0 if you want)
            let total_now = self.points_total.read((epoch, player));
            ResultSubmitted(player, day, new_points, 0_u64, total_now, time_sec, moves);
            return;
        }

        // delta add (B)
        let delta = new_points - old_best;
        self.best_points.write((epoch, player, day), new_points);

        // update best_all_time (optional)
        let old_all = self.best_all_time.read((epoch, player));
        if new_points > old_all {
            self.best_all_time.write((epoch, player), new_points);
        }

        // update totals
        let total_prev = self.points_total.read((epoch, player));
        let total_now = total_prev + delta;
        self.points_total.write((epoch, player), total_now);

        let day_prev = self.points_by_day.read((epoch, player, day));
        self.points_by_day.write((epoch, player, day), day_prev + delta);

        // leaderboard uses new_points (not delta)
        let entry = Entry { player, points: new_points, time_sec, moves };
        upsert_top10(ref self, epoch, day, entry);
        upsert_top10_alltime(ref self, epoch, entry);

        // emit
        ResultSubmitted(player, day, new_points, delta, total_now, time_sec, moves);
    }
}
