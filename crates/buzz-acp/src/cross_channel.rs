//! Cross-channel @mentions: an agent p-tagged in an open channel it has not
//! joined is woken (rate-capped) and told it is not a member.

use std::collections::{HashSet, VecDeque};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use uuid::Uuid;

/// Max non-member mention wakes per agent per rolling hour.
pub const NON_MEMBER_WAKES_PER_HOUR: usize = 30;
const WINDOW: Duration = Duration::from_secs(3600);

/// Channel types (from kind:39000) that admit non-member mention wakes.
/// `stream` is the open type; `private`, `dm` and `unknown` fail closed.
pub fn channel_type_admits_non_member(channel_type: Option<&str>) -> bool {
    channel_type == Some("stream")
}

/// Rolling-window cap on non-member wakes.
#[derive(Default)]
pub struct RateCap {
    hits: VecDeque<Instant>,
}

impl RateCap {
    pub fn try_admit(&mut self, now: Instant) -> bool {
        while self
            .hits
            .front()
            .is_some_and(|t| now.duration_since(*t) >= WINDOW)
        {
            self.hits.pop_front();
        }
        if self.hits.len() >= NON_MEMBER_WAKES_PER_HOUR {
            return false;
        }
        self.hits.push_back(now);
        true
    }
}

static NON_MEMBER_CHANNELS: Mutex<Option<HashSet<Uuid>>> = Mutex::new(None);

pub fn mark_non_member(channel: Uuid) {
    let mut g = NON_MEMBER_CHANNELS
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    g.get_or_insert_with(HashSet::new).insert(channel);
}

pub fn clear_non_member(channel: Uuid) {
    let mut g = NON_MEMBER_CHANNELS
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    if let Some(s) = g.as_mut() {
        s.remove(&channel);
    }
}

pub fn is_non_member(channel: Uuid) -> bool {
    let g = NON_MEMBER_CHANNELS
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    g.as_ref().is_some_and(|s| s.contains(&channel))
}

/// Prompt note for turns triggered from a channel the agent has not joined.
pub const NOT_A_MEMBER_NOTE: &str = "[Context]\nYou were @mentioned in an open channel you are NOT a member of. You can read and reply here (open channel), but you will only see messages that @mention you. Do not join the channel unless asked. Keep the reply focused on the mention.";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rate_cap_admits_30_per_hour_then_recovers() {
        let mut cap = RateCap::default();
        let t0 = Instant::now();
        for _ in 0..NON_MEMBER_WAKES_PER_HOUR {
            assert!(cap.try_admit(t0));
        }
        assert!(!cap.try_admit(t0 + Duration::from_secs(10)));
        assert!(cap.try_admit(t0 + WINDOW));
    }

    #[test]
    fn only_open_stream_channels_admit() {
        assert!(channel_type_admits_non_member(Some("stream")));
        for t in [Some("private"), Some("dm"), Some("unknown"), None] {
            assert!(!channel_type_admits_non_member(t));
        }
    }

    #[test]
    fn non_member_marks_round_trip() {
        let ch = Uuid::new_v4();
        assert!(!is_non_member(ch));
        mark_non_member(ch);
        assert!(is_non_member(ch));
        clear_non_member(ch);
        assert!(!is_non_member(ch));
    }
}
