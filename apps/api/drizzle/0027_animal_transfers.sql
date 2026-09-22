-- Faz 7.5: çiftlikler arası hayvan devri.
-- Çift taraflı: A gönderir, B kabul eder. Tek taraflı olsaydı A istediği hayvanı B'nin sürüsüne
-- atabilirdi.
CREATE TYPE transfer_status AS ENUM ('pending', 'accepted', 'rejected', 'cancelled');
--> statement-breakpoint

-- Hayvan taşınınca anne, baba ve geldiği çiftlik bilgisi kimlik olarak kullanılamaz (o satırlar
-- karşı çiftlikte kalıyor). Künye bilgisi burada metin olarak saklanır.
ALTER TABLE animals ADD COLUMN provenance jsonb;
--> statement-breakpoint

CREATE TABLE animal_transfers (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  animal_id uuid NOT NULL REFERENCES animals (id),
  from_farm_id uuid NOT NULL REFERENCES farms (id),
  to_farm_id uuid NOT NULL REFERENCES farms (id),
  -- İstek anındaki küpe; kabul sırasında çakışırsa new_tag_no dolar.
  tag_no text NOT NULL,
  new_tag_no text,
  status transfer_status NOT NULL DEFAULT 'pending',
  note text,
  decision_note text,
  requested_by uuid REFERENCES users (id),
  decided_by uuid REFERENCES users (id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT animal_transfers_farms_differ CHECK (from_farm_id <> to_farm_id)
);
--> statement-breakpoint
CREATE INDEX animal_transfers_to_idx ON animal_transfers (to_farm_id, status);
--> statement-breakpoint
CREATE INDEX animal_transfers_from_idx ON animal_transfers (from_farm_id, status);
--> statement-breakpoint
-- Bir hayvan aynı anda tek bir bekleyen devirde olabilir.
CREATE UNIQUE INDEX animal_transfers_pending_uq ON animal_transfers (animal_id) WHERE status = 'pending';
