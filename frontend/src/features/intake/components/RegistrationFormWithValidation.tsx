import { toast } from 'sonner';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ValidatedInput } from '@/components/ui/validated-input';
import { ValidatedSelect } from '@/components/ui/validated-select';
import { ValidatedCheckboxGroup } from '@/components/ui/validated-checkbox-group';
import { useFormValidation } from '@/hooks/useFormValidation';
import { TesdaFormHeader } from '@/components/forms/TesdaFormHeader';

interface RegistrationFormData {
  // Personal Information
  firstName: string;
  lastName: string;
  middleName: string;
  
  // Birth Details
  birthMonth: string;
  birthDay: string;
  birthYear: string;
  age: string;
  
  // Address
  city: string;
  province: string;
  region: string;
  completeAddress: string;
  
  // Educational Attainment
  educationalAttainment: string[];
  
  // Civil Status
  civilStatus: string;
  
  // Employment Status
  employmentStatus: string[];
  
  // Classification
  classification: string[];
}

const VALIDATION_RULES = {
  firstName: {
    required: true,
    minLength: 2,
    maxLength: 50,
    pattern: /^[a-zA-Z\s\u00f1\u00d1]+$/,
    custom: (value: string) => {
      if (value && /\d/.test(value)) {
        return 'Name cannot contain numbers';
      }
      return null;
    },
  },
  lastName: {
    required: true,
    minLength: 2,
    maxLength: 50,
    pattern: /^[a-zA-Z\s\u00f1\u00d1]+$/,
  },
  birthMonth: {
    required: true,
  },
  birthDay: {
    required: true,
    custom: (value: string) => {
      const day = parseInt(value);
      if (isNaN(day) || day < 1 || day > 31) {
        return 'Invalid day (1-31)';
      }
      return null;
    },
  },
  birthYear: {
    required: true,
    custom: (value: string) => {
      const year = parseInt(value);
      const currentYear = new Date().getFullYear();
      if (isNaN(year)) {
        return 'Invalid year';
      }
      if (year < 1900 || year > currentYear) {
        return `Year must be between 1900 and ${currentYear}`;
      }
      if (year > currentYear - 15) {
        return 'Trainee must be at least 15 years old';
      }
      return null;
    },
  },
  city: {
    required: true,
    minLength: 2,
  },
  province: {
    required: true,
  },
  region: {
    required: true,
  },
  completeAddress: {
    required: true,
    minLength: 10,
    maxLength: 200,
  },
  educationalAttainment: {
    required: true,
    custom: (value: string[]) => {
      if (!Array.isArray(value) || value.length === 0) {
        return 'Please select at least one educational attainment';
      }
      return null;
    },
  },
  civilStatus: {
    required: true,
  },
  employmentStatus: {
    required: true,
    custom: (value: string[]) => {
      if (!Array.isArray(value) || value.length === 0) {
        return 'Please select at least one employment status';
      }
      return null;
    },
  },
};

export function RegistrationFormWithValidation() {
  const {
    values,
    errors,
    touched,
    handleChange,
    handleBlur,
    validateAll,
    incompleteCount,
    reset,
  } = useFormValidation<RegistrationFormData>(
    {
      firstName: '',
      lastName: '',
      middleName: '',
      birthMonth: '',
      birthDay: '',
      birthYear: '',
      age: '',
      city: '',
      province: '',
      region: '',
      completeAddress: '',
      educationalAttainment: [],
      civilStatus: '',
      employmentStatus: [],
      classification: [],
    },
    VALIDATION_RULES,
  );

  // Auto-calculate age when birth year changes
  const handleBirthYearChange = (value: string) => {
    handleChange('birthYear', value);
    
    if (value && !isNaN(parseInt(value))) {
      const age = new Date().getFullYear() - parseInt(value);
      handleChange('age', age.toString());
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Show toast for incomplete fields
    if (incompleteCount > 0) {
      toast.error('Form Incomplete', {
        description: `Please complete ${incompleteCount} required field(s)`,
        icon: <AlertCircle className="h-5 w-5" />,
      });
    }

    // Validate all fields
    const isValid = validateAll();

    if (isValid) {
      toast.success('Validation Passed!', {
        description: 'Submitting your registration...',
        icon: <CheckCircle2 className="h-5 w-5" />,
      });
      
      console.log('Form submitted:', values);
      // TODO: Submit to API
    }
  };

  const handleSaveDraft = () => {
    toast.info('Draft Saved', {
      description: 'Your progress has been saved. You can continue later.',
    });
    console.log('Draft saved:', values);
    // TODO: Save draft to IndexedDB
  };

  return (
    <div className="space-y-6">
      {/* Official TESDA Form Header */}
      <TesdaFormHeader 
        formCode="MIS 03-01"
        formVersion="(ver. 2021)"
        formTitle="Registration Form"
        showIdPicture={true}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
      {/* Incomplete Fields Warning */}
      {incompleteCount > 0 && (
        <Card className="border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <h3 className="font-semibold text-amber-900">
                {incompleteCount} Required Field{incompleteCount > 1 ? 's' : ''} Remaining
              </h3>
              <p className="mt-1 text-sm text-amber-700">
                Please complete all required fields marked with <span className="text-red-600">*</span>
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Personal Information Section */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-bold text-slate-900">Personal Information</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ValidatedInput
            label="First Name"
            name="firstName"
            value={values.firstName}
            onChange={(e) => handleChange('firstName', e.target.value)}
            onBlur={() => handleBlur('firstName')}
            error={errors.firstName}
            touched={touched.firstName}
            required
            placeholder="Juan"
          />
          <ValidatedInput
            label="Last Name"
            name="lastName"
            value={values.lastName}
            onChange={(e) => handleChange('lastName', e.target.value)}
            onBlur={() => handleBlur('lastName')}
            error={errors.lastName}
            touched={touched.lastName}
            required
            placeholder="Dela Cruz"
          />
          <ValidatedInput
            label="Middle Name"
            name="middleName"
            value={values.middleName}
            onChange={(e) => handleChange('middleName', e.target.value)}
            placeholder="Santos (optional)"
          />
        </div>
      </Card>

      {/* Birth Details Section */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-bold text-slate-900">Birth Details</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          <ValidatedSelect
            label="Month"
            name="birthMonth"
            value={values.birthMonth}
            onChange={(e) => handleChange('birthMonth', e.target.value)}
            onBlur={() => handleBlur('birthMonth')}
            error={errors.birthMonth}
            touched={touched.birthMonth}
            required
            placeholder="Select month"
            options={[
              { value: '01', label: 'January' },
              { value: '02', label: 'February' },
              { value: '03', label: 'March' },
              { value: '04', label: 'April' },
              { value: '05', label: 'May' },
              { value: '06', label: 'June' },
              { value: '07', label: 'July' },
              { value: '08', label: 'August' },
              { value: '09', label: 'September' },
              { value: '10', label: 'October' },
              { value: '11', label: 'November' },
              { value: '12', label: 'December' },
            ]}
          />
          <ValidatedInput
            label="Day"
            name="birthDay"
            type="number"
            min="1"
            max="31"
            value={values.birthDay}
            onChange={(e) => handleChange('birthDay', e.target.value)}
            onBlur={() => handleBlur('birthDay')}
            error={errors.birthDay}
            touched={touched.birthDay}
            required
            placeholder="15"
          />
          <ValidatedInput
            label="Year"
            name="birthYear"
            type="number"
            min="1900"
            max={new Date().getFullYear()}
            value={values.birthYear}
            onChange={(e) => handleBirthYearChange(e.target.value)}
            onBlur={() => handleBlur('birthYear')}
            error={errors.birthYear}
            touched={touched.birthYear}
            required
            placeholder="1990"
          />
          <ValidatedInput
            label="Age"
            name="age"
            type="number"
            value={values.age}
            disabled
            helperText="Auto-calculated"
          />
        </div>
      </Card>

      {/* Address Section */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-bold text-slate-900">Address</h2>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <ValidatedInput
              label="City/Municipality"
              name="city"
              value={values.city}
              onChange={(e) => handleChange('city', e.target.value)}
              onBlur={() => handleBlur('city')}
              error={errors.city}
              touched={touched.city}
              required
              placeholder="Mamburao"
            />
            <ValidatedInput
              label="Province"
              name="province"
              value={values.province}
              onChange={(e) => handleChange('province', e.target.value)}
              onBlur={() => handleBlur('province')}
              error={errors.province}
              touched={touched.province}
              required
              placeholder="Occidental Mindoro"
            />
            <ValidatedInput
              label="Region"
              name="region"
              value={values.region}
              onChange={(e) => handleChange('region', e.target.value)}
              onBlur={() => handleBlur('region')}
              error={errors.region}
              touched={touched.region}
              required
              placeholder="MIMAROPA"
            />
          </div>
          <ValidatedInput
            label="Complete Permanent Mailing Address"
            name="completeAddress"
            value={values.completeAddress}
            onChange={(e) => handleChange('completeAddress', e.target.value)}
            onBlur={() => handleBlur('completeAddress')}
            error={errors.completeAddress}
            touched={touched.completeAddress}
            required
            placeholder="Barangay, Street, House Number"
          />
        </div>
      </Card>

      {/* Educational Attainment Section */}
      <Card className="p-6">
        <ValidatedCheckboxGroup
          label="Educational Attainment"
          name="educationalAttainment"
          value={values.educationalAttainment}
          onChange={(value) => handleChange('educationalAttainment', value)}
          onBlur={() => handleBlur('educationalAttainment')}
          error={errors.educationalAttainment}
          touched={touched.educationalAttainment}
          required
          columns={3}
          options={[
            { value: 'elementary', label: 'Elementary Undergraduate' },
            { value: 'elementary_graduate', label: 'Elementary Graduate' },
            { value: 'high_school', label: 'High School Undergraduate' },
            { value: 'junior_high', label: 'Junior High (K-12)' },
            { value: 'senior_high', label: 'Senior High (K-12)' },
            { value: 'post_secondary', label: 'Post-Secondary Non-Tertiary' },
            { value: 'college', label: 'College Undergraduate' },
            { value: 'college_graduate', label: 'College Graduate' },
            { value: 'masters', label: 'Masters' },
            { value: 'doctorate', label: 'Doctorate' },
          ]}
        />
      </Card>

      {/* Civil Status Section */}
      <Card className="p-6">
        <ValidatedCheckboxGroup
          label="Civil Status"
          name="civilStatus"
          value={values.civilStatus ? [values.civilStatus] : []}
          onChange={(value) => handleChange('civilStatus', value[0] || '')}
          onBlur={() => handleBlur('civilStatus')}
          error={errors.civilStatus}
          touched={touched.civilStatus}
          required
          columns={3}
          options={[
            { value: 'single', label: 'Single' },
            { value: 'married', label: 'Married' },
            { value: 'separated', label: 'Separated' },
            { value: 'divorced', label: 'Divorced' },
            { value: 'annulled', label: 'Annulled' },
            { value: 'widower', label: 'Widow/er' },
            { value: 'common_law', label: 'Common Law / Live-in' },
          ]}
        />
      </Card>

      {/* Employment Status Section */}
      <Card className="p-6">
        <ValidatedCheckboxGroup
          label="Employment Status"
          name="employmentStatus"
          value={values.employmentStatus}
          onChange={(value) => handleChange('employmentStatus', value)}
          onBlur={() => handleBlur('employmentStatus')}
          error={errors.employmentStatus}
          touched={touched.employmentStatus}
          required
          columns={3}
          options={[
            { value: 'wage_employed', label: 'Wage Employed' },
            { value: 'self_employed', label: 'Self-Employed' },
            { value: 'unemployed', label: 'Unemployed' },
            { value: 'underemployed', label: 'Underemployed' },
            { value: 'casual', label: 'Casual' },
            { value: 'probationary', label: 'Probationary' },
            { value: 'contractual', label: 'Contractual' },
            { value: 'job_order', label: 'Job Order' },
            { value: 'permanent', label: 'Permanent' },
            { value: 'temporary', label: 'Temporary' },
          ]}
        />
      </Card>

      {/* Form Actions */}
      <div className="sticky bottom-0 flex items-center justify-between border-t border-slate-200 bg-white p-4 shadow-lg">
        <Button type="button" variant="outline" onClick={reset}>
          Reset Form
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={handleSaveDraft}>
            Save Draft
          </Button>
          <Button type="submit">
            {incompleteCount > 0 ? `Complete ${incompleteCount} Required Field(s)` : 'Submit Application'}
          </Button>
        </div>
      </div>
    </form>
    </div>
  );
}
