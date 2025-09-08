
'use client';

import GoogleSheetForm from './google-sheet-form';

type PolygonFormProps = {
  onSubmit: (values: { wkts: string[]; resolution: number }) => void;
};


export default function PolygonForm({ onSubmit }: PolygonFormProps) {
  return (
    <div className="w-full">
      <GoogleSheetForm onSubmit={onSubmit} />
    </div>
  )
}
