'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, Download, FileSpreadsheet, Fuel, Gauge, Search, Trophy, Wrench, type LucideIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Vehicle = { id: string; plate: string; brand: string | null; model: string | null };
type Trip = { id: string; date: string; initial_mileage: number | null; final_mileage: number | null; status: string; vehicle_id: string };
type Fueling = { id: string; vehicle_id: string; date: string; liters: number; total_value: number; mileage: number };
type Maintenance = { id: string; vehicle_id: string; date: string; value: number | null; status: string };

type VehicleReport = {
  vehicle: Vehicle;
  trips: number;
  completedTrips: number;
  passengers: number;
  km: number;
  liters: number;
  fuelCost: number;
  maintenanceCost: number;
  totalCost: number;
  costPerKm: number;
  costPerTrip: number;
  costPerPassenger: number;
};

function monthStart(offset: number) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return d.toISOString().slice(0, 10);
}

function monthEnd(offset: number) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset + 1);
  d.setDate(0);
  return d.toISOString().slice(0, 10);
}

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function RelatoriosPage() {
  const supabase = createClient();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [fuelings, setFuelings] = useState<Fueling[]>([]);
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [passengerCounts, setPassengerCounts] = useState<Record<string, number>>({});
  const [previousTrips, setPreviousTrips] = useState<Trip[]>([]);
  const [previousFuelings, setPreviousFuelings] = useState<Fueling[]>([]);
  const [previousMaintenances, setPreviousMaintenances] = useState<Maintenance[]>([]);
  const [historyTrips, setHistoryTrips] = useState<Trip[]>([]);
  const [historyFuelings, setHistoryFuelings] = useState<Fueling[]>([]);
  const [historyMaintenances, setHistoryMaintenances] = useState<Maintenance[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  async function loadData() {
    setLoading(true);
    setMessage('');
    const start = `${month}-01`;
    const endDate = new Date(`${month}-01T00:00:00`);
    endDate.setMonth(endDate.getMonth() + 1);
    const end = endDate.toISOString().slice(0, 10);

    const previousStartDate = new Date(`${month}-01T00:00:00`);
    previousStartDate.setMonth(previousStartDate.getMonth() - 1);
    const previousStart = previousStartDate.toISOString().slice(0, 10);

    const historyStartDate = new Date(`${month}-01T00:00:00`);
    historyStartDate.setMonth(historyStartDate.getMonth() - 5);
    const historyStart = historyStartDate.toISOString().slice(0, 10);

    const [vehicleResult, tripResult, fuelingResult, maintenanceResult, passengerResult, previousTripResult, previousFuelingResult, previousMaintenanceResult, historyTripResult, historyFuelingResult, historyMaintenanceResult] = await Promise.all([
      supabase.from('vehicles').select('id,plate,brand,model').order('plate'),
      supabase.from('trips').select('id,date,initial_mileage,final_mileage,status,vehicle_id').gte('date', start).lt('date', end),
      supabase.from('fuelings').select('id,vehicle_id,date,liters,total_value,mileage').gte('date', start).lt('date', end),
      supabase.from('maintenances').select('id,vehicle_id,date,value,status').gte('date', start).lt('date', end),
      supabase.from('trip_passengers').select('trip_id').limit(10000),
      supabase.from('trips').select('id,date,initial_mileage,final_mileage,status,vehicle_id').gte('date', previousStart).lt('date', start),
      supabase.from('fuelings').select('id,vehicle_id,date,liters,total_value,mileage').gte('date', previousStart).lt('date', start),
      supabase.from('maintenances').select('id,vehicle_id,date,value,status').gte('date', previousStart).lt('date', start),
      supabase.from('trips').select('id,date,initial_mileage,final_mileage,status,vehicle_id').gte('date', historyStart).lt('date', end),
      supabase.from('fuelings').select('id,vehicle_id,date,liters,total_value,mileage').gte('date', historyStart).lt('date', end),
      supabase.from('maintenances').select('id,vehicle_id,date,value,status').gte('date', historyStart).lt('date', end),
    ]);

    const firstError = [vehicleResult, tripResult, fuelingResult, maintenanceResult, passengerResult, previousTripResult, previousFuelingResult, previousMaintenanceResult, historyTripResult, historyFuelingResult, historyMaintenanceResult].find((r) => r.error);
    if (firstError?.error) {
      setMessage(`Erro ao carregar relatório: ${firstError.error.message}`);
      setLoading(false);
      return;
    }

    const passengerRows = (passengerResult.data ?? []) as Array<{ trip_id: string }>;
    const tripIds = new Set((tripResult.data ?? []).map((t) => t.id));
    const counts: Record<string, number> = {};
    for (const row of passengerRows) {
      if (tripIds.has(row.trip_id)) counts[row.trip_id] = (counts[row.trip_id] ?? 0) + 1;
    }

    setVehicles((vehicleResult.data ?? []) as Vehicle[]);
    setTrips((tripResult.data ?? []) as Trip[]);
    setFuelings((fuelingResult.data ?? []) as Fueling[]);
    setMaintenances((maintenanceResult.data ?? []) as Maintenance[]);
    setPassengerCounts(counts);
    setPreviousTrips((previousTripResult.data ?? []) as Trip[]);
    setPreviousFuelings((previousFuelingResult.data ?? []) as Fueling[]);
    setPreviousMaintenances((previousMaintenanceResult.data ?? []) as Maintenance[]);
    setHistoryTrips((historyTripResult.data ?? []) as Trip[]);
    setHistoryFuelings((historyFuelingResult.data ?? []) as Fueling[]);
    setHistoryMaintenances((historyMaintenanceResult.data ?? []) as Maintenance[]);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, [month]);

  const reports = useMemo<VehicleReport[]>(() => {
    return vehicles.map((vehicle) => {
      const vehicleTrips = trips.filter((t) => t.vehicle_id === vehicle.id);
      const vehicleFuelings = fuelings.filter((f) => f.vehicle_id === vehicle.id);
      const vehicleMaintenances = maintenances.filter((m) => m.vehicle_id === vehicle.id && m.status !== 'CANCELLED');
      const km = vehicleTrips.reduce((sum, t) => {
        if (t.initial_mileage == null || t.final_mileage == null || t.final_mileage < t.initial_mileage) return sum;
        return sum + (t.final_mileage - t.initial_mileage);
      }, 0);
      const passengers = vehicleTrips.reduce((sum, t) => sum + (passengerCounts[t.id] ?? 0), 0);
      const fuelCost = vehicleFuelings.reduce((sum, f) => sum + Number(f.total_value || 0), 0);
      const maintenanceCost = vehicleMaintenances.reduce((sum, m) => sum + Number(m.value || 0), 0);
      return {
        vehicle,
        trips: vehicleTrips.length,
        completedTrips: vehicleTrips.filter((t) => t.status === 'COMPLETED').length,
        passengers,
        km,
        liters: vehicleFuelings.reduce((sum, f) => sum + Number(f.liters || 0), 0),
        fuelCost,
        maintenanceCost,
        totalCost: fuelCost + maintenanceCost,
        costPerKm: km > 0 ? (fuelCost + maintenanceCost) / km : 0,
        costPerTrip: vehicleTrips.length > 0 ? (fuelCost + maintenanceCost) / vehicleTrips.length : 0,
        costPerPassenger: passengers > 0 ? (fuelCost + maintenanceCost) / passengers : 0,
      };
    });
  }, [vehicles, trips, fuelings, maintenances, passengerCounts]);

  const filtered = reports.filter((r) => {
    const q = search.toLowerCase();
    return !q || [r.vehicle.plate, r.vehicle.brand, r.vehicle.model].filter(Boolean).join(' ').toLowerCase().includes(q);
  });

  const totals = reports.reduce((acc, r) => ({
    trips: acc.trips + r.trips,
    completedTrips: acc.completedTrips + r.completedTrips,
    passengers: acc.passengers + r.passengers,
    km: acc.km + r.km,
    liters: acc.liters + r.liters,
    fuelCost: acc.fuelCost + r.fuelCost,
    maintenanceCost: acc.maintenanceCost + r.maintenanceCost,
    totalCost: acc.totalCost + r.totalCost,
  }), { trips: 0, completedTrips: 0, passengers: 0, km: 0, liters: 0, fuelCost: 0, maintenanceCost: 0, totalCost: 0 });

  const previousTotals = useMemo(() => {
    const km = previousTrips.reduce((sum, t) => t.initial_mileage != null && t.final_mileage != null && t.final_mileage >= t.initial_mileage ? sum + t.final_mileage - t.initial_mileage : sum, 0);
    const fuelCost = previousFuelings.reduce((sum, f) => sum + Number(f.total_value || 0), 0);
    const maintenanceCost = previousMaintenances.filter((m) => m.status !== 'CANCELLED').reduce((sum, m) => sum + Number(m.value || 0), 0);
    return { trips: previousTrips.length, km, totalCost: fuelCost + maintenanceCost };
  }, [previousTrips, previousFuelings, previousMaintenances]);

  const ranking = useMemo(() => [...reports].filter((r) => r.trips > 0 || r.totalCost > 0).sort((a, b) => b.totalCost - a.totalCost).slice(0, 5), [reports]);
  const activeReports = reports.filter((r) => r.km > 0);
  const fleetAverageCostPerKm = activeReports.length > 0 ? activeReports.reduce((sum, r) => sum + r.costPerKm, 0) / activeReports.length : 0;
  const managementAlerts = useMemo(() => reports.flatMap((r) => {
    const alerts: string[] = [];
    if (r.totalCost > 0 && r.km === 0) alerts.push(`${r.vehicle.plate}: possui custos no período, mas nenhuma quilometragem registrada.`);
    if (r.km > 0 && fleetAverageCostPerKm > 0 && r.costPerKm > fleetAverageCostPerKm * 1.5) alerts.push(`${r.vehicle.plate}: custo por km está mais de 50% acima da média da frota.`);
    if (r.trips > 0 && r.completedTrips / r.trips < 0.7) alerts.push(`${r.vehicle.plate}: menos de 70% das viagens do período foram concluídas.`);
    if (r.maintenanceCost > 0 && r.totalCost > 0 && r.maintenanceCost / r.totalCost >= 0.6) alerts.push(`${r.vehicle.plate}: manutenção representa 60% ou mais do custo do veículo.`);
    return alerts;
  }).slice(0, 8), [reports, fleetAverageCostPerKm]);

  const monthlyHistory = useMemo(() => {
    const base = new Date(`${month}-01T00:00:00`);
    return Array.from({ length: 6 }, (_, index) => {
      const d = new Date(base);
      d.setMonth(d.getMonth() - (5 - index));
      const key = d.toISOString().slice(0, 7);
      const monthTrips = historyTrips.filter((t) => t.date.startsWith(key));
      const km = monthTrips.reduce((sum, t) => t.initial_mileage != null && t.final_mileage != null && t.final_mileage >= t.initial_mileage ? sum + t.final_mileage - t.initial_mileage : sum, 0);
      const fuelCost = historyFuelings.filter((f) => f.date.startsWith(key)).reduce((sum, f) => sum + Number(f.total_value || 0), 0);
      const maintenanceCost = historyMaintenances.filter((m) => m.date.startsWith(key) && m.status !== 'CANCELLED').reduce((sum, m) => sum + Number(m.value || 0), 0);
      return { key, label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), trips: monthTrips.length, km, cost: fuelCost + maintenanceCost };
    });
  }, [month, historyTrips, historyFuelings, historyMaintenances]);
  const maxHistoryCost = Math.max(...monthlyHistory.map((item) => item.cost), 1);

  function variation(current: number, previous: number) {
    if (previous === 0) return current === 0 ? 0 : null;
    return ((current - previous) / previous) * 100;
  }

  function Comparison({ label, current, previous, format = 'number' }: { label: string; current: number; previous: number; format?: 'number' | 'money' }) {
    const change = variation(current, previous);
    const up = change != null && change >= 0;
    return <div className="rounded-xl border bg-white p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-bold">{format === 'money' ? money(current) : current.toLocaleString('pt-BR')}</div>
      <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
        {change == null ? <span>Sem base no mês anterior</span> : <>
          {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          <span>{Math.abs(change).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% vs. mês anterior</span>
        </>}
      </div>
    </div>;
  }

  function exportCsv() {
    const header = ['Veículo','Viagens','Concluídas','Passageiros','KM rodados','Litros','Custo combustível','Custo manutenção','Custo total','Custo/KM','Custo/viagem','Custo/passageiro'];
    const lines = filtered.map((r) => [
      r.vehicle.plate, r.trips, r.completedTrips, r.passengers, r.km, r.liters.toFixed(2),
      r.fuelCost.toFixed(2), r.maintenanceCost.toFixed(2), r.totalCost.toFixed(2), r.costPerKm.toFixed(2), r.costPerTrip.toFixed(2), r.costPerPassenger.toFixed(2),
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'));
    const csv = '\uFEFF' + [header.join(';'), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `relatorio-frota-${month}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const kpis: Array<[string, string | number, LucideIcon]> = [
    ['Viagens', totals.trips, BarChart3],
    ['Passageiros', totals.passengers, Gauge],
    ['KM rodados', totals.km.toLocaleString('pt-BR'), Gauge],
    ['Custo total', money(totals.totalCost), BarChart3],
  ];

  return (
    <main className="min-h-screen bg-slate-50">
<section className=" p-4 md:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Relatórios</h1>
              <p className="text-sm text-slate-500">Resumo mensal da operação, quilometragem e custos da frota.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border bg-white px-3 py-2 text-sm" />
              <button onClick={exportCsv} disabled={loading || filtered.length === 0} className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"><Download size={16} /> Exportar CSV</button>
            </div>
          </div>

          {message && <div className="mb-4 rounded-lg border bg-white px-4 py-3 text-sm">{message}</div>}

          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map(([label, value, Icon]) => (
              <div key={String(label)} className="rounded-xl border bg-white p-5 shadow-sm">
                <Icon size={20} className="mb-3 text-slate-500" />
                <div className="text-2xl font-bold text-slate-900">{value}</div>
                <div className="text-sm text-slate-500">{label}</div>
              </div>
            ))}
          </div>

          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border bg-white p-5"><div className="text-sm text-slate-500">Custo médio por KM</div><div className="mt-2 text-xl font-bold">{money(totals.km > 0 ? totals.totalCost / totals.km : 0)}</div></div>
            <div className="rounded-xl border bg-white p-5"><div className="text-sm text-slate-500">Custo por viagem</div><div className="mt-2 text-xl font-bold">{money(totals.trips > 0 ? totals.totalCost / totals.trips : 0)}</div></div>
            <div className="rounded-xl border bg-white p-5"><div className="text-sm text-slate-500">Custo por passageiro</div><div className="mt-2 text-xl font-bold">{money(totals.passengers > 0 ? totals.totalCost / totals.passengers : 0)}</div></div>
            <div className="rounded-xl border bg-white p-5"><div className="text-sm text-slate-500">Taxa de conclusão</div><div className="mt-2 text-xl font-bold">{totals.trips > 0 ? ((totals.completedTrips / totals.trips) * 100).toLocaleString('pt-BR',{maximumFractionDigits:1}) : '0'}%</div></div>
          </div>

          <div className="mb-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Comparativo mensal</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Comparison label="Viagens" current={totals.trips} previous={previousTotals.trips} />
              <Comparison label="KM rodados" current={totals.km} previous={previousTotals.km} />
              <Comparison label="Custo total" current={totals.totalCost} previous={previousTotals.totalCost} format="money" />
            </div>
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border bg-white p-5"><div className="flex items-center gap-2 font-semibold"><Fuel size={18} /> Combustível</div><div className="mt-3 text-xl font-bold">{money(totals.fuelCost)}</div><div className="text-sm text-slate-500">{totals.liters.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} litros</div></div>
            <div className="rounded-xl border bg-white p-5"><div className="flex items-center gap-2 font-semibold"><Wrench size={18} /> Manutenção</div><div className="mt-3 text-xl font-bold">{money(totals.maintenanceCost)}</div><div className="text-sm text-slate-500">Serviços não cancelados</div></div>
            <div className="rounded-xl border bg-white p-5"><div className="flex items-center gap-2 font-semibold"><FileSpreadsheet size={18} /> Operação</div><div className="mt-3 text-xl font-bold">{totals.completedTrips}/{totals.trips}</div><div className="text-sm text-slate-500">viagens concluídas</div></div>
          </div>

          <div className="mb-6 rounded-xl border bg-white p-5">
            <div className="mb-1 font-semibold">Evolução dos últimos 6 meses</div>
            <div className="mb-5 text-sm text-slate-500">Custos, viagens e quilômetros até o mês selecionado.</div>
            <div className="grid grid-cols-6 gap-2">
              {monthlyHistory.map((item) => <div key={item.key} className="min-w-0 text-center">
                <div className="flex h-36 items-end justify-center">
                  <div className="w-full max-w-12 rounded-t bg-slate-800" style={{ height: `${Math.max((item.cost / maxHistoryCost) * 100, item.cost > 0 ? 6 : 2)}%` }} title={money(item.cost)} />
                </div>
                <div className="mt-2 text-xs font-medium capitalize text-slate-700">{item.label}</div>
                <div className="mt-1 text-xs font-semibold">{money(item.cost)}</div>
                <div className="text-[11px] text-slate-500">{item.trips} viagens · {item.km.toLocaleString('pt-BR')} km</div>
              </div>)}
            </div>
          </div>

          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border bg-white p-5"><div className="text-sm text-slate-500">Veículos utilizados</div><div className="mt-2 text-xl font-bold">{reports.filter((r) => r.trips > 0).length}/{vehicles.length}</div><div className="text-xs text-slate-500">com viagens no período</div></div>
            <div className="rounded-xl border bg-white p-5"><div className="text-sm text-slate-500">Média da frota por KM</div><div className="mt-2 text-xl font-bold">{money(fleetAverageCostPerKm)}</div><div className="text-xs text-slate-500">média entre veículos com KM registrado</div></div>
            <div className="rounded-xl border bg-white p-5"><div className="text-sm text-slate-500">Ocupação média</div><div className="mt-2 text-xl font-bold">{totals.completedTrips > 0 ? (totals.passengers / totals.completedTrips).toLocaleString('pt-BR',{maximumFractionDigits:1}) : '0'}</div><div className="text-xs text-slate-500">passageiros por viagem concluída</div></div>
          </div>

          {managementAlerts.length > 0 && <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
            <div className="mb-3 flex items-center gap-2 font-semibold text-amber-900"><AlertTriangle size={18} /> Alertas gerenciais</div>
            <div className="space-y-2 text-sm text-amber-900">{managementAlerts.map((alert) => <div key={alert}>• {alert}</div>)}</div>
            <div className="mt-3 text-xs text-amber-700">Alertas indicativos baseados nos registros do período; devem ser analisados pelo gestor antes de qualquer decisão.</div>
          </div>}

          {ranking.length > 0 && <div className="mb-6 rounded-xl border bg-white p-5">
            <div className="mb-4 flex items-center gap-2 font-semibold"><Trophy size={18} /> Ranking de custo por veículo</div>
            <div className="space-y-3">
              {ranking.map((r, index) => <div key={r.vehicle.id} className="flex items-center justify-between gap-4 border-b pb-3 last:border-0 last:pb-0">
                <div><span className="mr-3 text-sm font-bold text-slate-400">{index + 1}º</span><span className="font-medium">{r.vehicle.plate}</span><span className="ml-2 text-xs text-slate-500">{[r.vehicle.brand, r.vehicle.model].filter(Boolean).join(' ')}</span></div>
                <div className="text-right"><div className="font-semibold">{money(r.totalCost)}</div><div className="text-xs text-slate-500">{money(r.costPerKm)}/km</div></div>
              </div>)}
            </div>
          </div>}

          <div className="mb-4 flex items-center gap-2 rounded-xl border bg-white px-3 py-2">
            <Search size={18} className="text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrar por veículo, placa ou modelo" className="w-full outline-none text-sm" />
          </div>

          <div className="overflow-hidden rounded-xl border bg-white">
            {loading ? <div className="p-8 text-center text-sm text-slate-500">Carregando relatório...</div> :
              filtered.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">Nenhum dado encontrado para o período.</div> :
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Veículo</th><th className="px-4 py-3">Viagens</th><th className="px-4 py-3">Passageiros</th>
                      <th className="px-4 py-3">KM</th><th className="px-4 py-3">Litros</th><th className="px-4 py-3">Combustível</th>
                      <th className="px-4 py-3">Manutenção</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">R$/KM</th><th className="px-4 py-3">R$/Viagem</th><th className="px-4 py-3">R$/Passageiro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map((r) => (
                      <tr key={r.vehicle.id}>
                        <td className="px-4 py-3"><div className="font-medium">{r.vehicle.plate}</div><div className="text-xs text-slate-500">{[r.vehicle.brand, r.vehicle.model].filter(Boolean).join(' ')}</div></td>
                        <td className="px-4 py-3">{r.completedTrips}/{r.trips}</td>
                        <td className="px-4 py-3">{r.passengers}</td>
                        <td className="px-4 py-3">{r.km.toLocaleString('pt-BR')}</td>
                        <td className="px-4 py-3">{r.liters.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
                        <td className="px-4 py-3">{money(r.fuelCost)}</td>
                        <td className="px-4 py-3">{money(r.maintenanceCost)}</td>
                        <td className="px-4 py-3 font-semibold">{money(r.totalCost)}</td><td className="px-4 py-3">{money(r.costPerKm)}</td><td className="px-4 py-3">{money(r.costPerTrip)}</td><td className="px-4 py-3">{money(r.costPerPassenger)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            }
          </div>
        </div>
      </section>
    </main>
  );
}
