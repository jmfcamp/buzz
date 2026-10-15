-- Assist / NIP-ER reminders wake devices via class `reminder`. Lease + outbox
-- checks from 0058 only listed web message classes; widen both. Kind 30300 is
-- NOT added to the insert-time push match allowlist: wakes are enqueued by the
-- NIP-ER due scheduler when not_before passes (see buzz-relay main).
ALTER TABLE push_leases DROP CONSTRAINT IF EXISTS push_leases_max_class_check;
ALTER TABLE push_leases ADD CONSTRAINT push_leases_max_class_check CHECK (
    max_class IS NULL OR max_class IN (
        'silent','default','time_sensitive','urgent',
        'dm','mention','thread_reply','needs_action','channel','reminder'
    )
);
ALTER TABLE push_wake_outbox DROP CONSTRAINT IF EXISTS push_wake_outbox_class_check;
ALTER TABLE push_wake_outbox ADD CONSTRAINT push_wake_outbox_class_check CHECK (
    class IN (
        'silent','default','time_sensitive','urgent',
        'dm','mention','thread_reply','needs_action','channel','reminder'
    )
);
