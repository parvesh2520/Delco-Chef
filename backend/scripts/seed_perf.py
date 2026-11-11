"""Part I1 dataset: 10,000 customers, 500 chefs, 60,000 bookings, 2,000,000 location points over the last 90 days,
around Bengaluru. Bulk SQL (generate_series) so it runs in about a minute.

Run ONLY against a disposable benchmark database, e.g.
    docker run -d --name delco-bench -e POSTGRES_USER=delco -e POSTGRES_PASSWORD=delco -e POSTGRES_DB=bench -p 55433:5432 postgres:17-alpine
    set DATABASE_URL=postgresql://delco:delco@localhost:55433/bench  (and DIRECT_URL), then: alembic upgrade head
    python -m scripts.seed_perf
"""
import random
import sys
import time

from psycopg2.extras import execute_values
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine
from app.core.security import encrypt, lookup_hash

CUSTOMERS, CHEFS, BOOKINGS, POINTS = 10_000, 500, 60_000, 2_000_000
CUISINES = ["North Indian", "South Indian", "Bengali", "Gujarati", "Punjabi", "Continental", "Chinese", "Healthy / Diet"]


def main() -> None:
    if "neon.tech" in settings.migration_url or settings.is_production:
        sys.exit("Refusing: the performance dataset must go to a local benchmark database, not Neon/production.")
    rnd = random.Random(42)
    t0 = time.time()
    raw = engine.raw_connection()
    cur = raw.cursor()
    cur.execute("select count(*) from users where is_seed")
    if cur.fetchone()[0] > 1000:
        sys.exit("Benchmark data already present.")
    users = [("customer", encrypt(f"7{i:09d}"), lookup_hash(f"7{i:09d}"), f"Bench Customer {i}") for i in range(CUSTOMERS)]
    users += [("chef", encrypt(f"6{i:09d}"), lookup_hash(f"6{i:09d}"), f"Bench Chef {i}") for i in range(CHEFS)]
    ids = [r[0] for r in execute_values(cur, "insert into users (role, phone_enc, phone_hmac, full_name, is_seed) values %s returning id",
                                        [(*u, True) for u in users], page_size=2000, fetch=True)]
    cust_ids, chef_users = ids[:CUSTOMERS], ids[CUSTOMERS:]
    execute_values(cur, "insert into customer_profiles (user_id, is_seed, onboarded_at) values %s", [(i, True, "now()") for i in cust_ids])
    line = encrypt("1 Bench Road")
    addr_ids = [r[0] for r in execute_values(cur, "insert into addresses (user_id, label, line1_enc, city, pincode, lat, lng, is_default, is_seed) "
                                             "values %s returning id", [(u, "Home", line, "Bengaluru", "560001", 12.85 + rnd.random() * 0.25,
                                                                         77.48 + rnd.random() * 0.25, True, True) for u in cust_ids],
                                             page_size=2000, fetch=True)]
    chef_ids = [r[0] for r in execute_values(cur, "insert into chefs (user_id, status, active, home_lat, home_lng, rating, city, is_seed) values %s returning id",
                                             [(u, "approved", True, 12.85 + rnd.random() * 0.25, 77.48 + rnd.random() * 0.25,
                                               round(3.5 + rnd.random() * 1.5, 2), "Bengaluru", True) for u in chef_users], fetch=True)]
    execute_values(cur, "insert into chef_skills (chef_id, cuisine) values %s",
                   [(c, cu) for c in chef_ids for cu in rnd.sample(CUISINES, 3)])
    raw.commit()
    print(f"users/addresses/chefs: {time.time() - t0:.0f}s")
    # One request per booking pair; visits spaced 18 h apart per chef so the exclusion constraint holds.
    cur.execute("""
      create temp table m as select row_number() over () - 1 as i, u, a from unnest(%s::bigint[], %s::bigint[]) as t(u, a);
      create temp table ch as select row_number() over () - 1 as i, c from unnest(%s::bigint[]) as t(c);
    """, (cust_ids, addr_ids, chef_ids))
    cur.execute(f"""
      insert into service_requests (customer_id, service, stage, members, slot, start_date, diet, address_id, created_at, is_seed,
                                    cuisines, chef_id, assigned_at)
      select m.u, case when g % 2 = 0 then 'monthly_subscription' else 'custom_time' end,
             (array['closed','payment_done','closed','payment_done','closed'])[1 + g % 5], 1 + g % 7,
             case when g % 2 = 0 then 'morning' else 'evening' end,
             (now() - interval '90 days' + (g * interval '129 seconds'))::date,
             'veg', m.a, now() - interval '90 days' + (g * interval '129 seconds'), true, array['North Indian'],
             ch.c, now() - interval '90 days' + (g * interval '129 seconds')
      from generate_series(0, {BOOKINGS} - 1) g
      join m on m.i = g % {CUSTOMERS} join ch on ch.i = g % {CHEFS}
    """)
    cur.execute(f"""
      insert into visits (kind, request_id, customer_id, address_id, lat, lng, chef_id, service_date, starts_at, ends_at, status, price_paise, is_seed)
      select 'subscription', r.id, r.customer_id, r.address_id, a.lat, a.lng, r.chef_id,
             (now() - interval '90 days' + ((row_number() over (partition by r.chef_id order by r.id)) * interval '18 hours'))::date,
             now() - interval '90 days' + ((row_number() over (partition by r.chef_id order by r.id)) * interval '18 hours'),
             now() - interval '90 days' + ((row_number() over (partition by r.chef_id order by r.id)) * interval '18 hours') + interval '1 hour',
             'completed', 80000, true
      from service_requests r join addresses a on a.id = r.address_id where r.is_seed
    """)
    raw.commit()
    print(f"requests/visits: {time.time() - t0:.0f}s")
    cur.execute(f"""
      insert into location_points (visit_id, chef_id, lat, lng, accuracy_m, recorded_at)
      select v.id, v.chef_id, v.lat + (random() - 0.5) * 0.05, v.lng + (random() - 0.5) * 0.05, 10,
             v.starts_at - interval '40 minutes' + (s * interval '5 seconds')
      from (select id, chef_id, lat, lng, starts_at from visits where is_seed order by id limit {POINTS // 40}) v,
           generate_series(1, 40) s
    """)
    raw.commit()
    cur.execute("analyze")
    raw.commit()
    print(f"location points: done in {time.time() - t0:.0f}s total")


if __name__ == "__main__":
    main()
