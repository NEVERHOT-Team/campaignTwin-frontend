import type { Review } from './v1/client'
import chipsPhoto from './assets/goods-chips.webp'
import tissuePhoto from './assets/goods-tissue.webp'
import './product-goods.css'

type ProductPhoto = { src: string; alt: string; name: string; detail?: string }
type Listing = NonNullable<Review['resolved_product']>

export function catalogPhoto(product: Listing | null | undefined): ProductPhoto | null {
  if (product?.choice_id !== 'demo-tissue-12-shopee' || product.product_id !== 'synthetic-tissue' || product.pack_id !== 'synthetic-12-roll') return null
  return {
    src: tissuePhoto,
    alt: 'Illustrative product photo of toilet tissue.',
    name: product.label,
    detail: product.pack_label,
  }
}

export function categoryPhoto(category: string | undefined, brand?: string): ProductPhoto | null {
  if (!category) return null
  const normalized = category.trim().toLowerCase().replace(/[-\s]+/g, ' ')
  if (!['potato chips', 'potato chip multipack', 'potato chip multipacks'].includes(normalized)) return null
  return {
    src: chipsPhoto,
    alt: 'Illustrative product photo of potato chips.',
    name: category.trim(),
    detail: brand?.trim(),
  }
}

export function ProductGoods({ photo }: { photo: ProductPhoto | null }) {
  if (!photo) return null
  return <figure className="product-goods">
    <img src={photo.src} alt={photo.alt} width={640} height={640} decoding="async"/>
    <figcaption><strong>{photo.name}</strong>{photo.detail && <span>{photo.detail}</span>}</figcaption>
  </figure>
}
