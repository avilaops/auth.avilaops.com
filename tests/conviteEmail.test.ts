import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emailDeConvite, textoDeFora } from "@/lib/conviteEmail";

const base = { nome: "Ana Souza", sistema: "TMS", enderecoDoSistema: "https://tms.avilaops.com/", empresa: "Mello Transportes", convidadoPor: "Rogério" };
const LINK = "https://auth.avilaops.com/recuperar/abc123";

describe("e-mail do convite escrito pelo login", () => {
  it("conta nova: leva o endereço de criar senha, o do sistema e quem convidou", () => {
    const m = emailDeConvite({ ...base, link: LINK });
    assert.equal(m.assunto, "Seu acesso: TMS de Mello Transportes");
    assert.ok(m.texto.includes("Olá, Ana.") && m.texto.includes("Rogério liberou o seu acesso: TMS de Mello Transportes."));
    assert.ok(m.texto.includes(LINK) && m.texto.includes("https://tms.avilaops.com/") && m.texto.includes("vale por 7 dias"));
    assert.ok(m.html.includes(`href="${LINK}"`) && m.html.includes("Criar senha e entrar"));
  });

  it("conta que já tem senha: só o endereço do sistema, nenhum endereço de senha", () => {
    const m = emailDeConvite({ ...base, link: null });
    assert.ok(!m.texto.includes("/recuperar/") && !m.html.includes("/recuperar/"));
    assert.ok(m.texto.includes("entre com a senha que já usa") && m.html.includes('href="https://tms.avilaops.com/"'));
  });

  it("sem empresa e sem quem convidou, o texto continua inteiro", () => {
    const m = emailDeConvite({ ...base, empresa: null, convidadoPor: null, link: LINK });
    assert.equal(m.assunto, "Seu acesso: TMS");
    assert.ok(m.texto.includes("A equipe liberou o seu acesso: TMS."));
  });

  it("o que vem do outro sistema é escapado no HTML", () => {
    const m = emailDeConvite({ ...base, empresa: '<img src=x onerror="alert(1)">', link: LINK });
    assert.ok(!m.html.includes("<img") && m.html.includes("&lt;img"));
  });
});

describe("texto vindo de outro sistema", () => {
  it("tira quebra de linha e controle, apara e limita", () => {
    assert.equal(textoDeFora("  Mello\r\nBcc: x@y.z  "), "Mello Bcc: x@y.z");
    assert.equal(textoDeFora("a".repeat(200))?.length, 80);
  });

  it("vazio ou que não é texto vira nulo", () => {
    assert.equal(textoDeFora("   "), null);
    assert.equal(textoDeFora(42), null);
    assert.equal(textoDeFora(undefined), null);
  });
});
