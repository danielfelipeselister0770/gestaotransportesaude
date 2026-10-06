-- Garante que passageiros já vinculados a viagens recebam a mesma prefeitura da viagem.
update public.trip_passengers tp
set municipality_id = t.municipality_id
from public.trips t
where tp.trip_id = t.id
  and tp.municipality_id is null
  and t.municipality_id is not null;