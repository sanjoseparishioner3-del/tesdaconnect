interface TesdaFormHeaderProps {
  formCode?: string;
  formVersion?: string;
  formTitle?: string;
  showIdPicture?: boolean;
  idPictureUrl?: string | null;
}

export function TesdaFormHeader({
  formCode = 'MIS 03-01',
  formVersion = '(ver. 2021)',
  formTitle = 'Registration Form',
  showIdPicture = true,
  idPictureUrl = null,
}: TesdaFormHeaderProps) {
  return (
    <div className="w-full border-2 border-black bg-white">
      {/* Top Row: Logo, Authority Name, Form Code */}
      <div className="flex border-b-2 border-black">
        {/* TESDA Logo */}
        <div className="flex w-[140px] items-center justify-center border-r-2 border-black p-4">
          <div className="relative h-20 w-20">
            <img
              src="/tesda-logo.png"
              alt="TESDA Logo"
              className="h-full w-full object-contain"
            />
          </div>
        </div>

        {/* Authority Name */}
        <div className="flex flex-1 flex-col items-center justify-center border-r-2 border-black px-4 py-3 text-center">
          <h1 className="text-lg font-bold leading-tight text-gray-900">
            Technical Education and Skills Development Authority
          </h1>
          <p className="mt-1 text-xs text-gray-700">
            Pangasiwaan sa Edukasyong Teknikal at Pagpapaunlad ng Kasanayan
          </p>
        </div>

        {/* Form Code */}
        <div className="flex w-[140px] flex-col items-center justify-center px-4 py-3 text-center">
          <p className="text-sm font-bold text-gray-900">{formCode}</p>
          <p className="text-xs text-gray-600">{formVersion}</p>
        </div>
      </div>

      {/* Form Title Row */}
      <div className="flex border-b-2 border-black">
        <div className="flex flex-1 items-center justify-center py-4">
          <h2 className="text-2xl font-black text-gray-900">{formTitle}</h2>
        </div>
      </div>

      {/* Learners Profile Form Row */}
      <div className="flex">
        {/* Section Title */}
        <div className="flex flex-1 items-center border-r-2 border-black px-6 py-4">
          <h3 className="text-base font-black uppercase tracking-wide text-gray-900">
            Learners Profile Form
          </h3>
        </div>

        {/* I.D. Picture Box */}
        {showIdPicture && (
          <div className="flex w-[180px] flex-col items-center justify-center border-gray-400 px-4 py-2">
            <div className="relative flex h-[120px] w-[120px] items-center justify-center overflow-hidden border-2 border-dashed border-gray-400 bg-gray-50 shadow-inner">
              {idPictureUrl ? (
                <img
                  src={idPictureUrl}
                  alt="2x2 I.D. Picture"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-2 text-center text-gray-500">
                  <span className="text-xs font-semibold">2x2 I.D. Picture</span>
                  <span className="text-[9px] text-gray-400">Attach photo</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
