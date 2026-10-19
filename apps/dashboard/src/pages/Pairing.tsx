import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useCreatePairing } from "../lib/queries";
import { Button, Card, Input, Spinner } from "../components/ui";

export function PairingPage() {
  const create = useCreatePairing();
  const [label, setLabel] = useState("");

  const pairing = create.data;
  // The device app reads this payload from the QR to begin enrollment. It
  // contains only the one-time code + nonce, never a secret key.
  const qrPayload = pairing
    ? JSON.stringify({ code: pairing.pairingCode, nonce: pairing.challengeNonce })
    : "";

  return (
    <div className="max-w-md space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Pair a device</h1>
        <p className="mt-1 text-sm text-slate-400">
          Generate a single-use code, then scan it with the PDM app on the
          Android device you own. The code expires shortly and can be used once.
        </p>
      </div>

      <Card>
        <label className="mb-1 block text-xs text-slate-400">Device label (optional)</label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. My Pixel 9"
        />
        <Button
          className="mt-3 w-full"
          disabled={create.isPending}
          onClick={() => create.mutate(label || undefined)}
        >
          {create.isPending ? "Generating..." : "Generate pairing code"}
        </Button>
      </Card>

      {create.isPending && <Spinner label="Creating challenge..." />}
      {create.isError && (
        <p className="text-sm text-red-400">{(create.error as Error).message}</p>
      )}

      {pairing && (
        <Card className="text-center">
          <div className="mx-auto w-fit rounded-lg bg-white p-3">
            <QRCodeSVG value={qrPayload} size={180} />
          </div>
          <p className="mt-4 font-mono text-2xl tracking-widest">{pairing.pairingCode}</p>
          <p className="mt-1 text-xs text-slate-500">
            Expires {new Date(pairing.expiresAt).toLocaleTimeString()} · single use
          </p>
        </Card>
      )}
    </div>
  );
}
