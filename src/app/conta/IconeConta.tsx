type Props = { id: string; tamanho?: number };

/** Ícones da interface, sem depender de marcas ou imagens externas. */
export default function IconeConta({ id, tamanho = 22 }: Props) {
  let desenho;
  switch (id) {
    case "inicio": case "app":
      desenho = <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>; break;
    case "dados": case "crm":
      desenho = <><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/></>; break;
    case "seguranca":
      desenho = <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/></>; break;
    case "lojas":
      desenho = <><path d="m4 9 2-6h12l2 6v12H4V9ZM4 9h16M9 21v-7h6v7"/><path d="M8 3 7 9m9-6 1 6"/></>; break;
    case "erp":
      desenho = <><path d="m12 3 9 5-9 5-9-5 9-5ZM3 8v9l9 5 9-5V8M12 13v9M7 5.8l9 5"/></>; break;
    case "tms":
      desenho = <><path d="M3 5h11v12H3V5Zm11 5h4l3 4v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>; break;
    case "cms":
      desenho = <><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 8h18M8 8v13m4-8h5m-5 4h3"/></>; break;
    case "experiments": case "mlops":
      desenho = <><path d="M9 3h6m-5 0v6l-6 10a1.5 1.5 0 0 0 1.3 2h13.4a1.5 1.5 0 0 0 1.3-2L14 9V3M7.5 15h9"/><path d="m10 16 2-2 2 2"/></>; break;
    case "n8n": case "mcp":
      desenho = <><rect x="9" y="9" width="6" height="6" rx="1.5"/><circle cx="4" cy="4" r="2"/><circle cx="20" cy="4" r="2"/><circle cx="4" cy="20" r="2"/><circle cx="20" cy="20" r="2"/><path d="m6 6 3 3m6 6 3 3M6 18l3-3m6-6 3-3"/></>; break;
    case "arxis":
      desenho = <><path d="m3 9 9-6 9 6v12H3V9Zm6 12V9h6v12M3 9h18"/></>; break;
    case "threads":
      desenho = <><path d="M8 10h8M8 14h5"/><path d="M21 11a9 9 0 0 1-9 9H4l-2 2V11a9 9 0 0 1 19 0Z"/></>; break;
    case "busca":
      desenho = <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>; break;
    default:
      desenho = <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18m-13 5h3"/></>;
  }
  return <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{desenho}</svg>;
}
