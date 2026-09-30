# Ordine Italia

Web app installabile (PWA) per compilare ordini cliente e richieste di sostituzione in garanzia senza reso, da smartphone o computer, e generare il PDF da inviare al back office.

## Cosa fa

- Modulo **Ordine** (vendita, offerta, conto visione, conto vendita): cliente e riferimento, destinazione, pagamento, porto e trasporto, servizi aggiuntivi, righe con codice, descrizione, quantità, prezzo, sconto e data di spedizione, note.
- Modulo **Sostituzione in garanzia senza reso**: cliente, spedizione, articoli, modello, matricola e difetto.
- Controllo dei dati obbligatori prima dell'invio, con elenco di ciò che manca.
- PDF impaginato come il modulo cartaceo; invio tramite condivisione (smartphone) o download + email precompilata (computer).
- Archivio locale dei documenti creati: riapri, duplica, rigenera il PDF.
- Funziona offline una volta aperta.

## Listino prezzi

Il listino **non fa parte dell'app** e non va mai caricato nel repository.
Ogni agente carica il proprio file Excel da *Impostazioni → Carica listino*: le colonne codice, descrizione e prezzo vengono riconosciute in automatico (oppure si indicano a mano). Il listino resta solo nella memoria del browser di quel dispositivo finché non viene sostituito o rimosso.

## Intestazione e destinatari

Nome azienda, logo ed email di invio si impostano in *Impostazioni* e restano sul dispositivo. Con *Esporta configurazione* si ottiene un file da passare ai colleghi (senza listino e senza archivio); il file `.json` è escluso dal repository tramite `.gitignore`.

## Pubblicazione su GitHub Pages

1. Crea un repository e carica il contenuto di questa cartella (senza listini, PDF o configurazioni).
2. *Settings → Pages → Deploy from a branch*, branch `main`, cartella `/ (root)`.
3. Apri l'indirizzo `https://<utente>.github.io/<repository>/` dal telefono e scegli *Aggiungi a schermata Home* / *Installa app*.

Per rilasciare una nuova versione, modifica `VERSION` in `sw.js`: le app installate si aggiornano alla successiva apertura.

## Librerie incluse

jsPDF e jspdf-autotable (MIT), SheetJS Community Edition (Apache 2.0), font Barlow (SIL Open Font License, vedi `fonts/OFL-LICENSE.txt`).
