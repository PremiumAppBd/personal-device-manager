import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DeviceRequestType } from "@pdm/shared";
import { dataSource } from "./source";
import { useAuth } from "./auth";
import type { DeviceSettingsInput } from "./types";

/** All hooks require an authenticated token; they read it from auth context. */
function useToken(): string {
  const { token } = useAuth();
  if (!token) throw new Error("not authenticated");
  return token;
}

export function useDevices() {
  const token = useToken();
  return useQuery({
    queryKey: ["devices"],
    queryFn: () => dataSource.listDevices(token),
    refetchInterval: 20_000,
  });
}

export function useDevice(id: string) {
  const token = useToken();
  return useQuery({
    queryKey: ["device", id],
    queryFn: () => dataSource.getDevice(token, id),
  });
}

export function useStatusHistory(id: string) {
  const token = useToken();
  return useQuery({
    queryKey: ["status", id],
    queryFn: () => dataSource.getStatusHistory(token, id),
  });
}

export function useRequests(id: string) {
  const token = useToken();
  return useQuery({
    queryKey: ["requests", id],
    queryFn: () => dataSource.listRequests(token, id),
  });
}

export function useAudit() {
  const token = useToken();
  return useQuery({
    queryKey: ["audit"],
    queryFn: () => dataSource.listAudit(token),
  });
}

export function useUpdateSettings(id: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DeviceSettingsInput) =>
      dataSource.updateSettings(token, id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["device", id] });
      void qc.invalidateQueries({ queryKey: ["devices"] });
    },
  });
}

export function useRevokeDevice(id: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => dataSource.revokeDevice(token, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["device", id] });
      void qc.invalidateQueries({ queryKey: ["devices"] });
    },
  });
}

export function useRenameDevice(id: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (label: string) => dataSource.updateDeviceLabel(token, id, label),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["device", id] });
      void qc.invalidateQueries({ queryKey: ["devices"] });
    },
  });
}

export function useCreateRequest(id: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (type: DeviceRequestType) =>
      dataSource.createRequest(token, id, type),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["requests", id] }),
  });
}

export function useCreatePairing() {
  const token = useToken();
  return useMutation({
    mutationFn: (label?: string) => dataSource.createPairing(token, label),
  });
}
