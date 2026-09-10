#!/usr/bin/env python3
"""
meshsim — um dia inteiro de vida da malha Meshtastic da quinta, em ciclo.

Serve para quem esta a construir o dashboard ter dados a chegar sem esperar que
alguem pegue no radio. Publica no broker neutro, com a MESMA forma dos dados
reais, mas os nos chamam-se todos "SIM ..." e o gateway e o !51000001, por isso
nunca se confunde com trafego verdadeiro.

O relogio e o real: a bateria dos nos solares sobe de manha, enche a meio da
tarde e desce de noite; a conversa acontece as horas em que faria sentido; o
tracker anda de dia e dorme de noite. Ao fim de 24 h volta ao principio.

Variaveis de ambiente:
  SIM_HOST     broker              (test.mosquitto.org)
  SIM_PORT     porta TLS           (8886)
  SIM_PREFIX   prefixo dos topicos (fabfarm-45jexzbx)
  SIM_SPEED    aceleracao          (1 = tempo real; 60 = um dia em 24 min)
  SIM_FALAS    ficheiro das falas  (falas.txt, ao lado deste ficheiro)
"""
import json, math, os, random, ssl, sys, time
from datetime import datetime

import paho.mqtt.client as mqtt

VELOCIDADE = float(os.environ.get("SIM_SPEED", "1"))
GATEWAY = "!51000001"

# Os destinos. Nenhum passa pelo broker da quinta: dados falsos nunca entram
# em casa. Cada um leva o prefixo que o relay usa para os dados verdadeiros.
DESTINOS = [
    dict(nome="neutro", host="test.mosquitto.org", porta=8886,
         prefixo="fabfarm-45jexzbx", utilizador=None, palavra=None,
         ca=None, nome_inseguro=False),
    dict(nome="seeed", host="120.79.240.231", porta=8883,
         prefixo="fabfarm", utilizador="bianca", palavra="seeedbianca123",
         ca="/home/seeed/emqx-rootca.pem", nome_inseguro=True),
]
BROADCAST = 4294967295
CENTRO = (37.1305, -8.7180)          # a quinta, Sitio das Aguilhadas

# ------------------------------------------------------------------- as falas
# Os nos e o que eles dizem NAO vivem aqui: vivem em falas.txt, ao lado deste
# ficheiro, para quem escreve o tom da conversa nao ter de mexer em codigo.
# O ficheiro e relido sozinho sempre que muda.
FALAS = os.environ.get("SIM_FALAS") or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "falas.txt")

NOS, CONVERSA, SOLTAS = {}, [], []
_falas_marca = None


def le_falas(caminho):
    """Le falas.txt e devolve (nos, conversa, soltas).

    Quem escreve as falas nao tem de saber Python: uma linha torta e saltada
    com um aviso e o resto do ficheiro continua a valer.
    """
    nos, conversa, soltas = {}, [], []
    seccao = None
    with open(caminho, encoding="utf-8") as f:
        for numero, bruta in enumerate(f, 1):
            linha = bruta.split("#", 1)[0].strip()
            if not linha:
                continue
            if linha.startswith("[") and linha.endswith("]"):
                seccao = linha[1:-1].strip().lower()
                continue
            partes = [p.strip() for p in linha.split("|")]
            try:
                if seccao == "nos":
                    chave, num, curto, nome, alim, movel, hw = partes
                    nos[chave] = dict(num=int(num), curto=curto, nome=nome,
                                      alim=alim.lower(), hw=int(hw),
                                      movel=movel.lower() in ("sim", "s", "true", "1"))
                elif seccao == "conversa":
                    hora, quem, texto = partes
                    conversa.append((float(hora), quem, texto))
                elif seccao == "soltas":
                    quem, texto = partes
                    soltas.append((quem, texto))
                else:
                    print(f"falas.txt:{numero}: linha fora de qualquer seccao, saltada",
                          flush=True)
            except ValueError:
                print(f"falas.txt:{numero}: nao percebi esta linha, saltada: {linha}",
                      flush=True)

    # uma fala de alguem que nao existe nunca chegaria a sair; melhor dizer porque
    orfaos = {q for _, q, _ in conversa if q not in nos} | {q for q, _ in soltas if q not in nos}
    if orfaos:
        print("falas.txt: nao ha nenhum no chamado %s; essas falas ficam de fora"
              % ", ".join(sorted(orfaos)), flush=True)
        conversa = [c for c in conversa if c[1] in nos]
        soltas = [s for s in soltas if s[0] in nos]
    return nos, conversa, soltas


def recarrega_falas(primeira=False):
    """Aplica falas.txt se tiver mudado desde a ultima vez.

    Um ficheiro estragado nunca cala a malha: fica a valer o que ja estava em
    memoria. So a falta do ficheiro no arranque e que e fatal, e ai o systemd
    volta a tentar.
    """
    global NOS, CONVERSA, SOLTAS, _falas_marca
    try:
        marca = os.stat(FALAS).st_mtime
    except OSError as exc:
        if primeira:
            raise SystemExit(f"falta o ficheiro das falas: {FALAS} ({exc})")
        return
    if marca == _falas_marca:
        return
    try:
        nos, conversa, soltas = le_falas(FALAS)
    except Exception as exc:
        print(f"falas.txt ilegivel, fica a valer o que ja estava: {exc}", flush=True)
        return
    if not nos or not (conversa or soltas):
        if primeira:
            raise SystemExit(f"falas.txt sem nos ou sem falas: {FALAS}")
        print("falas.txt sem nos ou sem falas, fica a valer o que ja estava", flush=True)
        return
    NOS, CONVERSA, SOLTAS = nos, conversa, soltas
    _falas_marca = marca
    print("falas: %d nos, %d do dia, %d soltas (%s)"
          % (len(NOS), len(CONVERSA), len(SOLTAS), FALAS), flush=True)


_ultimas_ditas = []
_proxima_fala = 0.0
_ja_disse = set()
_ultimo_nodeinfo = {}
_ultima_telemetria = {}
_ultima_posicao = {}


def agora():
    """hora do dia em decimal, ja com a aceleracao aplicada"""
    t = time.time() * VELOCIDADE
    return (t % 86400) / 3600.0


def sol(hora):
    """0 no escuro, 1 ao meio-dia; nascer as 7, por as 20"""
    if hora < 7 or hora > 20:
        return 0.0
    return math.sin((hora - 7) / 13.0 * math.pi)


def bateria(chave, hora):
    n = NOS[chave]
    if n["alim"] == "rede":
        return 101, 4.21
    if n["alim"] == "solar":
        # cheia ao fim da tarde, minimo ao amanhecer
        base = 55 + 45 * sol(max(hora, 0))
        if hora > 20 or hora < 7:
            base = 60 - (hora + 24 - 20 if hora < 7 else hora - 20) * 1.5
        pct = max(35, min(100, base + random.uniform(-2, 2)))
    else:
        # pilha: desce devagar ao longo do dia
        pct = max(12, 95 - hora * 2.5 + random.uniform(-1, 1))
    volts = round(3.5 + (pct / 100.0) * 0.72, 3)
    return int(pct), volts


def posicao(chave, hora):
    """os moveis andam de dia e param de noite"""
    lat, lon = CENTRO
    if chave == "galinha":
        raio = 0.0012 if 7 < hora < 20 else 0.0002
    else:
        raio = 0.0035 if 8 < hora < 19 else 0.0
    ang = (hora / 24.0) * 2 * math.pi + (0.7 if chave == "tractor" else 0.0)
    return (round(lat + raio * math.sin(ang), 7),
            round(lon + raio * math.cos(ang), 7))


def envelope(chave, tipo, carga, hops=0):
    n = NOS[chave]
    return json.dumps({
        "channel": 0,
        "from": n["num"],
        "hop_start": 7,
        "hops_away": hops,
        "id": random.randint(100000000, 4000000000),
        "payload": carga,
        "rssi": random.randint(-105, -42),
        "sender": GATEWAY,
        "snr": round(random.uniform(-4, 11), 2),
        "timestamp": int(time.time()),
        "to": BROADCAST,
        "type": tipo,
    }, ensure_ascii=False)


def publica(clientes, chave, tipo, carga, hops=0):
    corpo = envelope(chave, tipo, carga, hops)
    for c, d in clientes:
        c.publish(f"{d['prefixo']}/msh/2/json/LongFast/{GATEWAY}", corpo, qos=0)
    marca = datetime.now().strftime("%H:%M:%S")
    resumo = carga.get("text") if tipo == "text" else tipo
    print(f"{marca}  {NOS[chave]['nome']:<14} {resumo}", flush=True)


def ciclo(clientes):
    global _ja_disse
    recarrega_falas()
    hora = agora()
    ts = time.time() * VELOCIDADE

    # uma fala a cada ~2 minutos reais, escolhida ao acaso mas a condizer com a
    # hora: de manha fala-se de rega, ao fim do dia de fechar as galinhas
    global _proxima_fala, _ultimas_ditas
    agora_real = time.time()
    if agora_real >= _proxima_fala:
        proximas = [(q, t) for h, q, t in CONVERSA if abs((h - hora + 12) % 24 - 12) < 2.5]
        conjunto = (proximas * 2 + SOLTAS) if proximas else SOLTAS
        escolhas = [c for c in conjunto if c[1] not in _ultimas_ditas] or conjunto
        quem, texto = random.choice(escolhas)
        publica(clientes, quem, "text", {"text": texto}, hops=random.randint(0, 2))
        _ultimas_ditas = (_ultimas_ditas + [texto])[-10:]
        _proxima_fala = agora_real + random.uniform(90, 150)

    for chave, n in NOS.items():
        # telemetria de cada no a cada ~8 minutos simulados
        if ts - _ultima_telemetria.get(chave, 0) > 480:
            pct, volts = bateria(chave, hora)
            publica(clientes, chave, "telemetry", {
                "air_util_tx": round(random.uniform(0.05, 1.4), 6),
                "battery_level": pct,
                "channel_utilization": round(random.uniform(0.5, 9.0), 4),
                "uptime_seconds": int(ts % 604800),
                "voltage": volts,
            }, hops=random.randint(0, 2))
            _ultima_telemetria[chave] = ts

        # posicao dos moveis a cada ~12 minutos simulados
        if n["movel"] and ts - _ultima_posicao.get(chave, 0) > 720:
            lat, lon = posicao(chave, hora)
            publica(clientes, chave, "position", {
                "altitude": random.randint(18, 46),
                "latitude_i": int(lat * 1e7),
                "longitude_i": int(lon * 1e7),
                "precision_bits": 32,
                "time": int(time.time()),
            }, hops=random.randint(0, 2))
            _ultima_posicao[chave] = ts

        # apresentacao de cada no a cada ~12 minutos simulados, escalonada por
        # no para nao sairem todas juntas: um dashboard que liga a meio aprende
        # os nomes em poucos minutos em vez de esperar pela ronda seguinte
        if ts - _ultimo_nodeinfo.get(chave, 0) > 720 + (n["num"] % 6) * 30:
            publica(clientes, chave, "nodeinfo", {
                "hardware": n["hw"],
                "id": f"!{n['num']:08x}",
                "longname": n["nome"],
                "role": 0,
                "shortname": n["curto"],
            }, hops=random.randint(0, 2))
            _ultimo_nodeinfo[chave] = ts


def liga(d):
    c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,
                    client_id=f"{d['prefixo']}-meshsim")
    if d["utilizador"]:
        c.username_pw_set(d["utilizador"], d["palavra"])
    c.tls_set(ca_certs=d["ca"], cert_reqs=ssl.CERT_REQUIRED)
    if d["nome_inseguro"]:
        # o certificado deles diz CN=Server e nos ligamos a um IP: a cadeia
        # valida, o nome nao bate certo
        c.tls_insecure_set(True)
    c.connect(d["host"], d["porta"], keepalive=60)
    c.loop_start()
    print(f"ligado a {d['nome']}: {d['host']}:{d['porta']} -> {d['prefixo']}/", flush=True)
    return c


def main():
    recarrega_falas(primeira=True)
    clientes = []
    for d in DESTINOS:
        try:
            clientes.append((liga(d), d))
        except Exception as exc:
            print(f"nao consegui ligar a {d['nome']}: {exc}", flush=True)
    if not clientes:
        raise SystemExit("nenhum destino disponivel")
    print(f"velocidade {VELOCIDADE}x", flush=True)
    while True:
        try:
            ciclo(clientes)
        except Exception as exc:
            print("erro no ciclo:", exc, flush=True)
        time.sleep(max(1.0, 20.0 / VELOCIDADE))


if __name__ == "__main__":
    # `meshsim.py --verifica <ficheiro>` le as falas e diz se estao boas, sem
    # publicar nada. E o que o temporizador corre antes de deixar entrar uma
    # versao nova: uma edicao estragada nunca chega ao servico.
    if len(sys.argv) > 2 and sys.argv[1] == "--verifica":
        try:
            nos, conversa, soltas = le_falas(sys.argv[2])
        except Exception as exc:
            raise SystemExit(f"nao consegui ler: {exc}")
        if not nos or not (conversa or soltas):
            raise SystemExit("sem nos ou sem falas")
        print("ok: %d nos, %d falas do dia, %d soltas" % (len(nos), len(conversa), len(soltas)))
        raise SystemExit(0)
    main()
