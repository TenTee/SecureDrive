// Folder path, Drive-style: "My Files › A › B". Every folder except the
// current (last) one is a link back to it.
//   items: [{ label, onClick }]   (onClick ignored for the last item)
//   children: extra controls shown after the path (e.g. an "Up" button)
export default function Breadcrumb({ items, children }) {
  return (
    <nav className="breadcrumb-path" aria-label="Breadcrumb">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={`${i}-${item.label}`} className="bc-item">
            {i > 0 && <span className="bc-sep" aria-hidden="true">›</span>}
            {isLast ? (
              <span className="bc-current" aria-current="page" title={item.label}>{item.label}</span>
            ) : (
              <button type="button" className="bc-link" title={item.label} onClick={item.onClick}>
                {item.label}
              </button>
            )}
          </span>
        );
      })}
      {children}
    </nav>
  );
}
