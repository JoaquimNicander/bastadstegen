# BTS Stegen — beslut från frågestunden

Fattade beslut som styr hur systemet byggs färdigt.

## Ordinarie stege

1. **Omflyttning av stegen** — Positionerna byter plats när **admin publicerar omgången**.
   Resultaten syns direkt när de rapporteras, men själva ranking-ändringen sker
   kontrollerat vid publicering.

2. **Inloggning & skydd** — **PIN-baserat**. Standard-PIN = sista fyra siffrorna i
   telefonnumret, men varje spelare kan ändra sin PIN och uppmuntras göra det.
   Vid skarp drift döljs PIN-koderna och valideras säkert på serversidan
   (ingen kan läsa andras koder), och skrivningar går via PIN-skyddade anrop.

3. **Tvister** — När en match bestrids flaggas den och **admin sätter rätt resultat**.

4. **Ospelade matcher vid publicering** — En omgång kan **inte publiceras förrän alla
   matcher är inne**. Säkerhetsventil: admin kan sätta walkover/återbud på en
   ospelad match, vilket räknas som "inne" så en sen spelare inte låser klubben.

5. **Nya spelare & avhopp** — Nya spelare placeras **längst ner** i stegen. Avhopp
   **låses** (spelaren markeras inaktiv och tas ur kommande omgångar), men
   historiken behålls.

## Sommarstege (drop-in)

6. **Lottning** — **Mix**: lottas inom närliggande nivågrupper så matcherna blir
   jämna men man inte alltid möter samma motståndare.

7. **För många anmälda** — **Väntelista** (först till kvarn). Övriga meddelas vid
   återbud.

8. **Anmälan** — **Admin stänger manuellt** och kör lottningen. Admin anger hur
   många banor som är lediga den aktuella veckan.

9. **Förhållande till ordinarie ranking** — **Egen separat stege**, men lottningen
   **seedas från ordinarie ranking** som nivå. Sommarresultaten påverkar inte den
   vanliga stegen, men **statistik samlas** även för sommarstegen.

---

## Vad detta innebär att bygga (kvarvarande)

- **Säkerhet (RLS-lås)**: dölj PIN-kolumnen, PIN-validering + skyddade skriv-anrop
  (Postgres-funktioner), stäng av direkt skrivning. *Måste vara klart innan publicering.*
- **PIN-hantering**: spelare kan byta PIN (sparas i databasen).
- **Publicera omgång**: koppla in omflyttningen mot databasen (med "alla inne"-spärr
  + walkover-ventil).
- **Spelarhantering**: lägg till (sist) / inaktivera spelare mot databasen + aktiv-flagga.
- **Sommarstege**: veckoanmälan, väntelista, admin-lottning (mix, banantal),
  egen ställning seedad från ranking, statistikinsamling.
- **Driftsättning**: publicera till bastadstegen.se när säkerheten är låst.
