import assert from "node:assert/strict";
import { it } from "node:test";
import { GET } from "@/app/api/conta/foto/route";
it("a foto privada exige sessão e não consulta conta de outro visitante", async () => {
  const resposta = await GET();
  assert.equal(resposta.status, 401);
});
